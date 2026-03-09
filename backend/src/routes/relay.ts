import { Router, Request, Response, NextFunction } from "express";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import { hasEncryption } from "../config.js";
import { authMiddleware } from "../middleware/auth.js";
import { decrypt } from "../lib/encrypt.js";

const router = Router();

/** Accept relay token (Bearer) for assign-port/release-port. App sends relay token, not JWT. */
function relayTokenAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const token = header.slice(7);
  if (!config.relayPublicToken || token !== config.relayPublicToken) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  next();
}

/** Return relay (FRP) token to authenticated users only. Key stays on server. */
router.get("/token", authMiddleware, (req: Request, res: Response): void => {
  if (!config.relayPublicToken) {
    res.status(503).json({ error: "Relay not configured" });
    return;
  }
  res.json({ token: config.relayPublicToken });
});

/** Relay config for Share server: apiBaseUrl points at this backend so assign-port is proxied (avoids 404 on play.ihost.one). Only when RELAY_PORT_API_URL is set. */
router.get("/config", authMiddleware, (req: Request, res: Response): void => {
  if (!config.relayPublicToken || !config.relayPortApiUrl) {
    res.status(503).json({ error: "Relay not configured" });
    return;
  }
  const proto = (req.get("x-forwarded-proto") as string) || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host") || "";
  const apiBaseUrl = `${proto}://${host}/api/relay`;
  res.json({
    token: config.relayPublicToken,
    apiBaseUrl,
    serverAddr: config.relayServerAddr,
    serverPort: config.relayServerPort,
  });
});

/** Proxy assign-port to the real port-api (Go). Accepts relay token (app sends it, not JWT). */
router.post("/assign-port", relayTokenAuth, async (req: Request, res: Response): Promise<void> => {
  if (!config.relayPortApiUrl) {
    res.status(503).json({ error: "Relay port API not configured" });
    return;
  }
  const base = config.relayPortApiUrl.replace(/\/$/, "");
  try {
    const upstream = await fetch(`${base}/assign-port`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.relayPublicToken}`, "Content-Type": "application/json" },
    });
    const text = await upstream.text();
    res.status(upstream.status).setHeader("Content-Type", upstream.headers.get("Content-Type") || "application/json");
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: "Relay port API unreachable" });
  }
});

/** Proxy release-port to the real port-api. Accepts relay token. */
router.post("/release-port/:port", relayTokenAuth, async (req: Request, res: Response): Promise<void> => {
  if (!config.relayPortApiUrl) {
    res.status(503).json({ error: "Relay port API not configured" });
    return;
  }
  const { port } = req.params;
  const base = config.relayPortApiUrl.replace(/\/$/, "");
  try {
    const upstream = await fetch(`${base}/release-port/${port}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.relayPublicToken}` },
    });
    const text = await upstream.text();
    res.status(upstream.status);
    if (text) res.setHeader("Content-Type", upstream.headers.get("Content-Type") || "application/json").send(text);
    else res.end();
  } catch {
    res.status(502).json({ error: "Relay port API unreachable" });
  }
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
