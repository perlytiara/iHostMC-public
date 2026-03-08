import { Router, Request, Response } from "express";
import { query } from "../db/pool.js";
import { encrypt, decrypt } from "../lib/encrypt.js";
import { authMiddleware } from "../middleware/auth.js";
import { hasEncryption } from "../config.js";

const router = Router();
const CURSEFORGE_KEY_NAME = "curseforge";

router.use(authMiddleware);

/** Store or update an API key (encrypted). */
router.put("/:keyName", async (req: Request, res: Response): Promise<void> => {
  if (!hasEncryption()) {
    res.status(503).json({ error: "Key storage not configured (ENCRYPTION_KEY)" });
    return;
  }
  const userId = (req as Request & { userId: string }).userId;
  const keyName = req.params.keyName;
  if (keyName !== CURSEFORGE_KEY_NAME) {
    res.status(400).json({ error: "Unknown key type" });
    return;
  }
  const { value } = req.body as { value?: string };
  if (typeof value !== "string" || !value.trim()) {
    res.status(400).json({ error: "value required" });
    return;
  }
  try {
    const encrypted = encrypt(value.trim());
    await query(
      `INSERT INTO user_api_keys (user_id, key_name, encrypted_value, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id, key_name)
       DO UPDATE SET encrypted_value = $3, updated_at = now()`,
      [userId, keyName, encrypted]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to store key" });
  }
});

/** Get decrypted API key (only that it's set, not the value, for UI; or return masked). */
router.get("/:keyName", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const keyName = req.params.keyName;
  if (keyName !== CURSEFORGE_KEY_NAME) {
    res.status(400).json({ error: "Unknown key type" });
    return;
  }
  const result = await query<{ encrypted_value: string }>(
    "SELECT encrypted_value FROM user_api_keys WHERE user_id = $1 AND key_name = $2",
    [userId, keyName]
  );
  const row = result.rows[0];
  if (!row) {
    res.json({ set: false });
    return;
  }
  try {
    const decrypted = decrypt(row.encrypted_value);
    res.json({ set: true, value: decrypted });
  } catch {
    res.status(500).json({ error: "Failed to read key" });
  }
});

/** Delete stored key. */
router.delete("/:keyName", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const keyName = req.params.keyName;
  if (keyName !== CURSEFORGE_KEY_NAME) {
    res.status(400).json({ error: "Unknown key type" });
    return;
  }
  await query("DELETE FROM user_api_keys WHERE user_id = $1 AND key_name = $2", [userId, keyName]);
  res.json({ ok: true });
});

export default router;
