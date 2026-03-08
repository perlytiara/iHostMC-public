import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import type { JwtPayload } from "../middleware/auth.js";

const router = Router();
const TOKEN_EXPIRY = "7d";

/** GET /api/auth/providers – list enabled OAuth providers (for UI buttons) */
router.get("/providers", (_req: Request, res: Response) => {
  const providers: string[] = [];
  if (config.oauth.google.clientId) providers.push("google");
  if (config.oauth.github.clientId) providers.push("github");
  if (config.oauth.discord.clientId) providers.push("discord");
  if (config.oauth.microsoft.clientId) providers.push("microsoft");
  res.json({ providers });
});

type OAuthState = { provider: string; returnTo?: string; session?: string };

function encodeState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

function decodeState(state: string): OAuthState | null {
  try {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf-8")) as OAuthState;
  } catch {
    return null;
  }
}

function redirectWithError(res: Response, websiteUrl: string, message: string): void {
  const url = new URL("/login", websiteUrl);
  url.searchParams.set("error", message);
  res.redirect(url.toString());
}

async function findOrCreateUser(
  provider: string,
  providerUserId: string,
  email: string,
  displayName: string | null
): Promise<{ userId: string; email: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await query<{ user_id: string; email: string }>(
    "SELECT user_id, u.email FROM oauth_accounts oa JOIN users u ON u.id = oa.user_id WHERE oa.provider = $1 AND oa.provider_user_id = $2",
    [provider, providerUserId]
  );
  if (existing.rows[0]) {
    return { userId: existing.rows[0].user_id, email: existing.rows[0].email };
  }
  const byEmail = await query<{ id: string; email: string }>(
    "SELECT id, email FROM users WHERE email = $1",
    [normalizedEmail]
  );
  if (byEmail.rows[0]) {
    await query(
      "INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email, display_name, updated_at) VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT (provider, provider_user_id) DO UPDATE SET email = $4, display_name = $5, updated_at = now()",
      [byEmail.rows[0].id, provider, providerUserId, normalizedEmail, displayName]
    );
    return { userId: byEmail.rows[0].id, email: byEmail.rows[0].email };
  }
  const insert = await query<{ id: string }>(
    "INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ($1, NULL, $2, now()) RETURNING id",
    [normalizedEmail, displayName]
  );
  const userId = insert.rows[0]!.id;
  await query(
    "INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email, display_name, updated_at) VALUES ($1, $2, $3, $4, $5, now())",
    [userId, provider, providerUserId, normalizedEmail, displayName]
  );
  return { userId, email: normalizedEmail };
}

function issueAndRedirect(
  res: Response,
  userId: string,
  email: string,
  state: OAuthState,
  websiteUrl: string
): void {
  const token = jwt.sign(
    { sub: userId, email } as JwtPayload,
    config.jwtSecret,
    { expiresIn: TOKEN_EXPIRY }
  );
  const returnTo = state.returnTo ?? "/dashboard";
  const base = state.session
    ? `${websiteUrl}/login/callback?session=${encodeURIComponent(state.session)}&token=${encodeURIComponent(token)}`
    : `${websiteUrl}/login/callback?token=${encodeURIComponent(token)}`;
  const url = returnTo && returnTo !== "/dashboard" ? `${base}&returnTo=${encodeURIComponent(returnTo)}` : base;
  res.redirect(url);
}

const websiteUrl = (): string => config.websiteUrl.replace(/\/$/, "");

// ----- Google -----
router.get("/google", (req: Request, res: Response) => {
  if (!config.oauth.google.clientId) {
    return res.status(503).json({ error: "Google login is not configured" });
  }
  const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : undefined;
  const session = typeof req.query.session === "string" ? req.query.session : undefined;
  const state = encodeState({ provider: "google", returnTo, session });
  const redirectUri = `${config.oauthRedirectBase}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: config.oauth.google.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get("/google/callback", async (req: Request, res: Response) => {
  if (!config.oauth.google.clientId || !config.oauth.google.clientSecret) {
    return redirectWithError(res, websiteUrl(), "Google login is not configured");
  }
  const state = decodeState((req.query.state as string) || "");
  const code = req.query.code as string;
  if (!state || !code) {
    return redirectWithError(res, websiteUrl(), "Invalid callback");
  }
  const redirectUri = `${config.oauthRedirectBase}/api/auth/google/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.oauth.google.clientId,
      client_secret: config.oauth.google.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    return redirectWithError(res, websiteUrl(), "Google sign-in failed");
  }
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return redirectWithError(res, websiteUrl(), "Google sign-in failed");
  }
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) {
    return redirectWithError(res, websiteUrl(), "Could not load profile");
  }
  const userData = (await userRes.json()) as { id: string; email?: string; name?: string };
  const email = userData.email || `${userData.id}@google.oauth`;
  const { userId, email: storedEmail } = await findOrCreateUser(
    "google",
    userData.id,
    email,
    userData.name ?? null
  );
  issueAndRedirect(res, userId, storedEmail, state, websiteUrl());
});

// ----- GitHub -----
router.get("/github", (req: Request, res: Response) => {
  if (!config.oauth.github.clientId) {
    return res.status(503).json({ error: "GitHub login is not configured" });
  }
  const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : undefined;
  const session = typeof req.query.session === "string" ? req.query.session : undefined;
  const state = encodeState({ provider: "github", returnTo, session });
  const redirectUri = `${config.oauthRedirectBase}/api/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: config.oauth.github.clientId,
    redirect_uri: redirectUri,
    scope: "user:email read:user",
    state,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

router.get("/github/callback", async (req: Request, res: Response) => {
  if (!config.oauth.github.clientId || !config.oauth.github.clientSecret) {
    return redirectWithError(res, websiteUrl(), "GitHub login is not configured");
  }
  const state = decodeState((req.query.state as string) || "");
  const code = req.query.code as string;
  if (!state || !code) {
    return redirectWithError(res, websiteUrl(), "Invalid callback");
  }
  const redirectUri = `${config.oauthRedirectBase}/api/auth/github/callback`;
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.oauth.github.clientId,
      client_secret: config.oauth.github.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    return redirectWithError(res, websiteUrl(), "GitHub sign-in failed");
  }
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return redirectWithError(res, websiteUrl(), "GitHub sign-in failed");
  }
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!userRes.ok) {
    return redirectWithError(res, websiteUrl(), "Could not load profile");
  }
  const userData = (await userRes.json()) as { id: number; login?: string; name?: string | null; email?: string | null };
  let email = userData.email?.trim();
  if (!email) {
    const emailRes = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
    });
    if (emailRes.ok) {
      const emails = (await emailRes.json()) as Array<{ email: string; primary?: boolean }>;
      const primary = emails.find((e) => e.primary) ?? emails[0];
      email = primary?.email ?? `${userData.id}@github.oauth`;
    } else {
      email = `${userData.id}@github.oauth`;
    }
  }
  const { userId, email: storedEmail } = await findOrCreateUser(
    "github",
    String(userData.id),
    email,
    userData.name ?? userData.login ?? null
  );
  issueAndRedirect(res, userId, storedEmail, state, websiteUrl());
});

// ----- Discord -----
router.get("/discord", (req: Request, res: Response) => {
  if (!config.oauth.discord.clientId) {
    return res.status(503).json({ error: "Discord login is not configured" });
  }
  const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : undefined;
  const session = typeof req.query.session === "string" ? req.query.session : undefined;
  const state = encodeState({ provider: "discord", returnTo, session });
  const redirectUri = `${config.oauthRedirectBase}/api/auth/discord/callback`;
  const params = new URLSearchParams({
    client_id: config.oauth.discord.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify email",
    state,
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

router.get("/discord/callback", async (req: Request, res: Response) => {
  if (!config.oauth.discord.clientId || !config.oauth.discord.clientSecret) {
    return redirectWithError(res, websiteUrl(), "Discord login is not configured");
  }
  const state = decodeState((req.query.state as string) || "");
  const code = req.query.code as string;
  if (!state || !code) {
    return redirectWithError(res, websiteUrl(), "Invalid callback");
  }
  const redirectUri = `${config.oauthRedirectBase}/api/auth/discord/callback`;
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.oauth.discord.clientId,
      client_secret: config.oauth.discord.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    return redirectWithError(res, websiteUrl(), "Discord sign-in failed");
  }
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return redirectWithError(res, websiteUrl(), "Discord sign-in failed");
  }
  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) {
    return redirectWithError(res, websiteUrl(), "Could not load profile");
  }
  const userData = (await userRes.json()) as { id: string; username?: string; email?: string; global_name?: string };
  const email = userData.email?.trim() || `${userData.id}@discord.oauth`;
  const displayName = userData.global_name ?? userData.username ?? null;
  const { userId, email: storedEmail } = await findOrCreateUser("discord", userData.id, email, displayName);
  issueAndRedirect(res, userId, storedEmail, state, websiteUrl());
});

// ----- Microsoft -----
router.get("/microsoft", (req: Request, res: Response) => {
  if (!config.oauth.microsoft.clientId) {
    return res.status(503).json({ error: "Microsoft login is not configured" });
  }
  const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : undefined;
  const session = typeof req.query.session === "string" ? req.query.session : undefined;
  const state = encodeState({ provider: "microsoft", returnTo, session });
  const redirectUri = `${config.oauthRedirectBase}/api/auth/microsoft/callback`;
  const tenant = config.oauth.microsoft.tenant;
  const params = new URLSearchParams({
    client_id: config.oauth.microsoft.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state,
  });
  res.redirect(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`);
});

router.get("/microsoft/callback", async (req: Request, res: Response) => {
  if (!config.oauth.microsoft.clientId || !config.oauth.microsoft.clientSecret) {
    return redirectWithError(res, websiteUrl(), "Microsoft login is not configured");
  }
  const state = decodeState((req.query.state as string) || "");
  const code = req.query.code as string;
  if (!state || !code) {
    return redirectWithError(res, websiteUrl(), "Invalid callback");
  }
  const redirectUri = `${config.oauthRedirectBase}/api/auth/microsoft/callback`;
  const tenant = config.oauth.microsoft.tenant;
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.oauth.microsoft.clientId,
      client_secret: config.oauth.microsoft.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      scope: "openid profile email",
    }),
  });
  if (!tokenRes.ok) {
    return redirectWithError(res, websiteUrl(), "Microsoft sign-in failed");
  }
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return redirectWithError(res, websiteUrl(), "Microsoft sign-in failed");
  }
  const userRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!userRes.ok) {
    return redirectWithError(res, websiteUrl(), "Could not load profile");
  }
  const userData = (await userRes.json()) as { id: string; mail?: string; userPrincipalName?: string; displayName?: string };
  const email = (userData.mail ?? userData.userPrincipalName ?? "").trim() || `${userData.id}@microsoft.oauth`;
  const { userId, email: storedEmail } = await findOrCreateUser(
    "microsoft",
    userData.id,
    email,
    userData.displayName ?? null
  );
  issueAndRedirect(res, userId, storedEmail, state, websiteUrl());
});

export default router;
