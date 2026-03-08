import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import { authMiddleware, type JwtPayload } from "../middleware/auth.js";
import { sendVerificationEmail, sendPasswordResetEmail, canSendEmail } from "../lib/email.js";
import { normalizeEmailLocale } from "../lib/email-strings.js";
import { verifyRecaptcha } from "../lib/recaptcha.js";
import oauthRoutes from "./oauth.js";
import webauthnRoutes from "./webauthn.js";

const router = Router();

// OAuth (Google, GitHub, Discord, Microsoft) – mount first so /google, /github etc. are matched
router.use(oauthRoutes);
router.use("/webauthn", webauthnRoutes);
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = "7d";
const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;

/** App handoff: session created by app, registered by website, claimed by app. Stored in DB so multiple instances and restarts work. */
const APP_SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function pruneExpiredAppSessions(): Promise<void> {
  await query("DELETE FROM app_sessions WHERE expires_at < now()");
}

router.post("/register", async (req: Request, res: Response): Promise<void> => {
  const recaptchaToken = (req.body?.recaptchaToken ?? req.body?.["g-recaptcha-response"]) as string | undefined;
  const recaptcha = await verifyRecaptcha(recaptchaToken);
  if (!recaptcha.success) {
    res.status(400).json({ error: recaptcha.error ?? "reCAPTCHA verification failed" });
    return;
  }
  try {
    const { email, password, displayName, username } = req.body as {
      email?: string;
      password?: string;
      displayName?: string;
      username?: string;
    };
    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      res.status(400).json({ error: "Email and password required" });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }
    const displayNameVal =
      displayName != null && typeof displayName === "string" && displayName.trim().length > 0
        ? displayName.trim().slice(0, 100)
        : null;
    const usernameVal =
      username != null && typeof username === "string" && username.trim().length > 0
        ? username.trim().slice(0, 50).toLowerCase().replace(/[^a-z0-9_-]/g, "")
        : null;
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await query<{ id: string }>(
      "INSERT INTO users (email, password_hash, display_name, username) VALUES ($1, $2, $3, $4) RETURNING id",
      [normalizedEmail, passwordHash, displayNameVal, usernameVal]
    );
    const userId = result.rows[0]!.id;
    const token = jwt.sign(
      { sub: userId, email: normalizedEmail } as JwtPayload,
      config.jwtSecret,
      { expiresIn: TOKEN_EXPIRY }
    );
    res.status(201).json({ token, userId, email: normalizedEmail });
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[auth] register failed:", err.message);
    const msg = err.message;
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    const payload: { error: string; detail?: string } = { error: "Registration failed" };
    if (config.nodeEnv !== "production") payload.detail = msg;
    res.status(500).json(payload);
  }
});

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const recaptchaToken = (req.body?.recaptchaToken ?? req.body?.["g-recaptcha-response"]) as string | undefined;
  const recaptcha = await verifyRecaptcha(recaptchaToken);
  if (!recaptcha.success) {
    res.status(400).json({ error: recaptcha.error ?? "reCAPTCHA verification failed" });
    return;
  }
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      res.status(400).json({ error: "Email and password required" });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const result = await query<{ id: string; password_hash: string | null; email_verified_at: string | null }>(
      "SELECT id, password_hash, email_verified_at FROM users WHERE email = $1",
      [normalizedEmail]
    );
    const row = result.rows[0];
    if (!row || !row.password_hash || !(await bcrypt.compare(password, row.password_hash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const token = jwt.sign(
      { sub: row.id, email: normalizedEmail } as JwtPayload,
      config.jwtSecret,
      { expiresIn: TOKEN_EXPIRY }
    );
    res.json({
      token,
      userId: row.id,
      email: normalizedEmail,
      emailVerified: Boolean(row.email_verified_at),
    });
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[auth] login failed:", err.message);
    const payload: { error: string; detail?: string } = { error: "Login failed" };
    if (config.nodeEnv !== "production") payload.detail = err.message;
    res.status(500).json(payload);
  }
});

router.get("/me", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const userEmail = (req as Request & { userEmail: string }).userEmail;
  try {
    const result = await query<{
      display_name: string | null;
      username: string | null;
      email_verified_at: string | null;
    }>(
      "SELECT display_name, username, email_verified_at FROM users WHERE id = $1",
      [userId]
    );
    const row = result.rows[0];
    const displayName = row?.display_name ?? null;
    const username = row?.username ?? null;
    const emailVerified = Boolean(row?.email_verified_at);
    res.json({ userId, email: userEmail, displayName, username, emailVerified });
  } catch {
    res.json({ userId, email: userEmail, displayName: null, username: null, emailVerified: false });
  }
});

router.patch("/me", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { displayName, username } = req.body as { displayName?: string; username?: string };
  if (displayName !== undefined) {
    const val =
      displayName == null || (typeof displayName === "string" && displayName.trim().length === 0)
        ? null
        : displayName.trim().slice(0, 100);
    try {
      await query("UPDATE users SET display_name = $1, updated_at = now() WHERE id = $2", [val, userId]);
    } catch {
      res.status(500).json({ error: "Failed to update profile" });
      return;
    }
  }
  if (username !== undefined) {
    const val =
      username == null || (typeof username === "string" && username.trim().length === 0)
        ? null
        : username.trim().slice(0, 50).toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (val !== null && val.length < 2) {
      res.status(400).json({ error: "Username must be at least 2 characters (letters, numbers, _, -)" });
      return;
    }
    try {
      await query("UPDATE users SET username = $1, updated_at = now() WHERE id = $2", [val, userId]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        res.status(409).json({ error: "Username already taken" });
        return;
      }
      res.status(500).json({ error: "Failed to update profile" });
      return;
    }
  }
  const result = await query<{ email: string; display_name: string | null; username: string | null }>(
    "SELECT email, display_name, username FROM users WHERE id = $1",
    [userId]
  );
  const row = result.rows[0];
  if (!row) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ userId, email: row.email, displayName: row.display_name, username: row.username });
});

router.post("/send-verification-email", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const userEmail = (req as Request & { userEmail: string }).userEmail;
  if (!canSendEmail()) {
    res.status(503).json({ error: "Email verification is not configured" });
    return;
  }
  try {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
    await query(
      "UPDATE users SET email_verification_token = $1, email_verification_expires_at = $2 WHERE id = $3",
      [token, expiresAt, userId]
    );
    const acceptLanguage = req.headers["accept-language"];
    const locale = typeof acceptLanguage === "string" ? acceptLanguage.split(",")[0]?.split("-")[0]?.trim() : undefined;
    const result = await sendVerificationEmail(userEmail, token, normalizeEmailLocale(locale));
    if (!result.ok) {
      res.status(500).json({ error: result.error ?? "Failed to send email" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to send verification email" });
  }
});

router.post("/verify-email", async (req: Request, res: Response): Promise<void> => {
  const token = (req.query.token ?? req.body?.token) as string | undefined;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token required" });
    return;
  }
  try {
    const result = await query<{ id: string }>(
      "UPDATE users SET email_verified_at = now(), email_verification_token = NULL, email_verification_expires_at = NULL WHERE email_verification_token = $1 AND email_verification_expires_at > now() RETURNING id",
      [token]
    );
    if (result.rows.length === 0) {
      res.status(400).json({ error: "Invalid or expired link" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Verification failed" });
  }
});

router.post("/forgot-password", async (req: Request, res: Response): Promise<void> => {
  const recaptchaToken = (req.body?.recaptchaToken ?? req.body?.["g-recaptcha-response"]) as string | undefined;
  const recaptcha = await verifyRecaptcha(recaptchaToken);
  if (!recaptcha.success) {
    res.status(400).json({ error: recaptcha.error ?? "reCAPTCHA verification failed" });
    return;
  }
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email required" });
    return;
  }
  if (!canSendEmail()) {
    res.status(503).json({ error: "Password reset is not configured" });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  try {
    const row = await query<{ id: string }>("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (row.rows.length === 0) {
      res.json({ ok: true });
      return;
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await query(
      "UPDATE users SET password_reset_token = $1, password_reset_expires_at = $2 WHERE id = $3",
      [token, expiresAt, row.rows[0]!.id]
    );
    const acceptLanguage = req.headers["accept-language"];
    const locale = typeof acceptLanguage === "string" ? acceptLanguage.split(",")[0]?.split("-")[0]?.trim() : undefined;
    const result = await sendPasswordResetEmail(normalizedEmail, token, normalizeEmailLocale(locale));
    if (!result.ok) {
      res.status(500).json({ error: result.error ?? "Failed to send email" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to process request" });
  }
});

router.post("/reset-password", async (req: Request, res: Response): Promise<void> => {
  const recaptchaToken = (req.body?.recaptchaToken ?? req.body?.["g-recaptcha-response"]) as string | undefined;
  const recaptcha = await verifyRecaptcha(recaptchaToken);
  if (!recaptcha.success) {
    res.status(400).json({ error: recaptcha.error ?? "reCAPTCHA verification failed" });
    return;
  }
  const token = (req.query.token ?? req.body?.token) as string | undefined;
  const { password } = req.body as { password?: string };
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token required" });
    return;
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await query<{ id: string }>(
      "UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires_at = NULL, updated_at = now() WHERE password_reset_token = $2 AND password_reset_expires_at > now() RETURNING id",
      [hash, token]
    );
    if (result.rows.length === 0) {
      res.status(400).json({ error: "Invalid or expired link" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to reset password" });
  }
});

router.post("/change-password", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword || typeof currentPassword !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "currentPassword and newPassword required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }
  try {
    const row = await query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [userId]);
    if (!row.rows[0] || !(await bcrypt.compare(currentPassword, row.rows[0].password_hash))) {
      res.status(401).json({ error: "Current password is wrong" });
      return;
    }
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [hash, userId]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to change password" });
  }
});

// --- App session handoff (verified through website/backend, no localhost) ---

/** Create a pending app session. App uses session_id in login URL; after user signs in on website, website calls register. */
router.post("/app-session", async (_req: Request, res: Response): Promise<void> => {
  await pruneExpiredAppSessions();
  const sessionId = crypto.randomBytes(12).toString("hex");
  const expiresAt = new Date(Date.now() + APP_SESSION_TTL_MS);
  try {
    await query(
      "INSERT INTO app_sessions (id, expires_at) VALUES ($1, $2)",
      [sessionId, expiresAt]
    );
    res.status(201).json({ session_id: sessionId });
  } catch {
    res.status(500).json({ error: "Failed to create session" });
  }
});

/** Register auth for an app session (website calls after user signs in). Requires Bearer token. */
router.post("/app-session/register", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const userEmail = (req as Request & { userEmail: string }).userEmail;
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const { session_id: sessionId } = req.body as { session_id?: string };
  if (!sessionId || typeof sessionId !== "string" || !token.trim()) {
    res.status(400).json({ error: "session_id and Authorization required" });
    return;
  }
  const sid = sessionId.trim();
  try {
    const r = await query<{ id: string }>(
      "UPDATE app_sessions SET token = $1, user_id = $2, email = $3, expires_at = $4 WHERE id = $5 AND expires_at > now() RETURNING id",
      [token, userId, userEmail, new Date(Date.now() + APP_SESSION_TTL_MS), sid]
    );
    if (r.rowCount === 0) {
      res.status(404).json({ error: "Invalid or expired session" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to register session" });
  }
});

/** Claim app session (one-time). App polls after user signs in on website. */
router.get("/app-session", async (req: Request, res: Response): Promise<void> => {
  const sessionId = (req.query.session_id as string)?.trim();
  if (!sessionId) {
    res.status(400).json({ error: "session_id required" });
    return;
  }
  await pruneExpiredAppSessions();
  try {
    const r = await query<{ token: string | null; user_id: string; email: string | null }>(
      "DELETE FROM app_sessions WHERE id = $1 AND token IS NOT NULL AND expires_at > now() RETURNING token, user_id, email",
      [sessionId]
    );
    const row = r.rows[0];
    if (!row?.token || !row.user_id || row.email == null) {
      res.status(404).json({ error: "Invalid or expired session" });
      return;
    }
    res.json({ token: row.token, userId: row.user_id, email: row.email });
  } catch {
    res.status(500).json({ error: "Failed to claim session" });
  }
});

export default router;
