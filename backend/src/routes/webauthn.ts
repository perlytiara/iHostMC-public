import { Router, Request, Response } from "express";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const registrationChallenges = new Map<
  string,
  { challenge: string; exp: number }
>();

function pruneChallenges(): void {
  const now = Date.now();
  for (const [k, v] of registrationChallenges.entries()) {
    if (v.exp < now) registrationChallenges.delete(k);
  }
}

/** POST /api/auth/webauthn/register-options – get options for creating a passkey (auth required). */
router.post(
  "/register-options",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as Request & { userId: string }).userId;
    const userEmail = (req as Request & { userEmail: string }).userEmail;
    pruneChallenges();
    try {
      const rows = await query<{ credential_id: string }>(
        "SELECT credential_id FROM webauthn_credentials WHERE user_id = $1",
        [userId]
      );
      const excludeCredentials = rows.rows.map((r) => ({
        id: r.credential_id,
        transports: [] as ("internal" | "usb" | "nfc" | "ble")[],
      }));
      const options = await generateRegistrationOptions({
        rpName: "iHostMC",
        rpID: config.webauthnRpId,
        userName: userEmail,
        userDisplayName: userEmail,
        timeout: 60000,
        attestationType: "none",
        excludeCredentials: excludeCredentials.length > 0 ? excludeCredentials : undefined,
      });
      registrationChallenges.set(userId, {
        challenge: options.challenge,
        exp: Date.now() + CHALLENGE_TTL_MS,
      });
      res.json(options);
    } catch (e) {
      console.error("[webauthn] register-options:", e);
      res.status(500).json({ error: "Failed to generate registration options" });
    }
  }
);

/** POST /api/auth/webauthn/register-verify – verify and store passkey (auth required). */
router.post(
  "/register-verify",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as Request & { userId: string }).userId;
    const body = req.body as { response?: RegistrationResponseJSON };
    if (!body?.response) {
      res.status(400).json({ error: "response required" });
      return;
    }
    pruneChallenges();
    const stored = registrationChallenges.get(userId);
    if (!stored) {
      res.status(400).json({ error: "Challenge expired. Start registration again." });
      return;
    }
    registrationChallenges.delete(userId);
    try {
      const verification = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge: stored.challenge,
        expectedOrigin: config.webauthnOrigin,
        expectedRPID: config.webauthnRpId,
      });
      if (!verification.verified || !verification.registrationInfo) {
        res.status(400).json({ error: "Verification failed" });
        return;
      }
      const { credential } = verification.registrationInfo;
      const credentialId = credential.id;
      const publicKey = Buffer.from(credential.publicKey);
      const counter = credential.counter ?? 0;
      const deviceType = verification.registrationInfo.credentialDeviceType;
      const transports = body.response.response.transports?.join(",") ?? null;
      await query(
        `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, device_type, transports)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, credentialId, publicKey, counter, deviceType ?? null, transports]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error("[webauthn] register-verify:", e);
      res.status(400).json({ error: "Verification failed" });
    }
  }
);

/** GET /api/auth/webauthn/credentials – list passkeys for current user (auth required). */
router.get(
  "/credentials",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as Request & { userId: string }).userId;
    try {
      const result = await query<{
        id: string;
        credential_id: string;
        device_type: string | null;
        created_at: string;
      }>(
        "SELECT id, credential_id, device_type, created_at FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at",
        [userId]
      );
      res.json({
        credentials: result.rows.map((r) => ({
          id: r.id,
          deviceType: r.device_type,
          createdAt: r.created_at,
        })),
      });
    } catch {
      res.status(500).json({ error: "Failed to list credentials" });
    }
  }
);

/** DELETE /api/auth/webauthn/credentials/:id – remove a passkey (auth required). */
router.delete(
  "/credentials/:id",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as Request & { userId: string }).userId;
    const id = req.params.id;
    try {
      const result = await query(
        "DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2 RETURNING id",
        [id, userId]
      );
      if (result.rowCount === 0) {
        res.status(404).json({ error: "Credential not found" });
        return;
      }
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete credential" });
    }
  }
);

export default router;
