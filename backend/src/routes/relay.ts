import { Router, Request, Response } from "express";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import { hasEncryption } from "../config.js";
import { authMiddleware } from "../middleware/auth.js";
import { decrypt } from "../lib/encrypt.js";

const router = Router();

/** Return relay (FRP) token to authenticated users only. Key stays on server. */
router.get("/token", authMiddleware, (req: Request, res: Response): void => {
  if (!config.relayPublicToken) {
    res.status(503).json({ error: "Relay not configured" });
    return;
  }
  res.json({ token: config.relayPublicToken });
});

/**
 * Return effective CurseForge API key for authenticated user: server-wide key first, else user's stored key (decrypted).
 * App uses this so CurseForge works without manual key entry in Settings.
 */
router.get("/curseforge-key", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  if (config.curseforgeApiKey && config.curseforgeApiKey.trim()) {
    res.json({ key: config.curseforgeApiKey.trim() });
    return;
  }
  if (!hasEncryption()) {
    res.json({ key: "" });
    return;
  }
  const result = await query<{ encrypted_value: string }>(
    "SELECT encrypted_value FROM user_api_keys WHERE user_id = $1 AND key_name = $2",
    [userId, "curseforge"]
  );
  const row = result.rows[0];
  if (!row) {
    res.json({ key: "" });
    return;
  }
  try {
    const key = decrypt(row.encrypted_value);
    res.json({ key });
  } catch {
    res.status(500).json({ error: "Failed to read key" });
  }
});

export default router;
