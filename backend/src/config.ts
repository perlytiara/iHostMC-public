import "dotenv/config";

function env(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  port: parseInt(process.env.PORT ?? "3010", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",

  /** Postgres connection string (required for auth/keys/usage; optional for health-only) */
  databaseUrl: process.env.DATABASE_URL ?? "",

  /** JWT secret for signing tokens (min 32 chars) */
  jwtSecret: env("JWT_SECRET", "dev-secret-change-in-production-min-32-chars"),

  /** AES-256 key for encrypting API keys (32 bytes hex or base64) */
  encryptionKey: env("ENCRYPTION_KEY", ""),

  /** Stripe secret key (sk_...) – live mode */
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",

  /** Stripe webhook secret (whsec_...) for verifying webhooks – live */
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",

  /** Stripe price ID for subscription or usage (e.g. price_...) – legacy single price */
  stripePriceId: process.env.STRIPE_PRICE_ID ?? "",

  /** Stripe test mode (no real charges) – devs can toggle in UI */
  stripeTestSecretKey: process.env.STRIPE_TEST_SECRET_KEY ?? "",
  stripeTestWebhookSecret: process.env.STRIPE_TEST_WEBHOOK_SECRET ?? "",
  stripeTestPublishableKey: process.env.STRIPE_TEST_PUBLISHABLE_KEY ?? "",
  stripeTestPriceIdBackup: process.env.STRIPE_TEST_PRICE_ID_BACKUP ?? "",
  stripeTestPriceIdPro: process.env.STRIPE_TEST_PRICE_ID_PRO ?? "",

  /** Billing: price in USD for display (e.g. 7.99). Charge in Stripe per your Price. */
  billingPriceUsd: parseFloat(process.env.BILLING_PRICE_USD ?? "7.99"),

  /** Free tier: max API request units per calendar month. */
  freeTierRequestsPerMonth: parseInt(process.env.FREE_TIER_REQUESTS_PER_MONTH ?? "50", 10),

  /** Paid tier: included API request units per month (subscription active). */
  paidTierRequestsPerMonth: parseInt(process.env.PAID_TIER_REQUESTS_PER_MONTH ?? "5000", 10),

  /** Allowed CORS origins (comma-separated); use * for dev */
  corsOrigins: (process.env.CORS_ORIGINS ?? "*").split(",").map((s) => s.trim()),

  /** Relay (FRP) token – returned to logged-in users only; never ship in client build */
  relayPublicToken: process.env.RELAY_PUBLIC_TOKEN ?? "",
  /** Port-assignment API URL (Go service). If set, backend proxies /api/relay/assign-port and release-port here so app can use api.ihost.one instead of play.ihost.one. */
  relayPortApiUrl: (process.env.RELAY_PORT_API_URL ?? "").trim(),
  /** FRP server host for frpc (e.g. play.ihost.one). Returned in relay config. */
  relayServerAddr: (process.env.RELAY_SERVER_ADDR ?? "play.ihost.one").trim(),
  /** FRP server port (default 7000). */
  relayServerPort: parseInt(process.env.RELAY_SERVER_PORT ?? "7000", 10) || 7000,

  /** CurseForge API key – returned to logged-in app/website users so they can use CurseForge without entering their own key */
  curseforgeApiKey: process.env.CURSEFORGE_API_KEY ?? "",

  /** xAI (Grok) API key – server-side only; used for AI prompts, never exposed to users. Set in .env on server. */
  xaiApiKey: process.env.XAI_API_KEY ?? "",

  /** Directory for user backup uploads (must exist; created on first use if possible) */
  backupStoragePath: process.env.BACKUP_STORAGE_PATH ?? "",

  /** Max backups for free tier (no Backup/Pro subscription). */
  freeTierMaxBackups: parseInt(process.env.FREE_TIER_MAX_BACKUPS ?? "3", 10),
  /** Max backups for Backup or Pro tier. */
  backupTierMaxBackups: parseInt(process.env.BACKUP_TIER_MAX_BACKUPS ?? "30", 10),
  /** Optional: global storage limit in GB (0 = no limit). Overridden by per-tier limits when set. */
  backupStorageLimitGb: Math.max(0, parseInt(process.env.BACKUP_STORAGE_LIMIT_GB ?? "0", 10)),
  /** Per-tier storage limits in GB: free (e.g. 5 for early users), backup 15, pro 100. */
  storageLimitGbByTier: {
    free: Math.max(0, parseInt(process.env.STORAGE_LIMIT_GB_FREE ?? "5", 10)),
    backup: Math.max(0, parseInt(process.env.STORAGE_LIMIT_GB_BACKUP ?? "15", 10)),
    pro: Math.max(0, parseInt(process.env.STORAGE_LIMIT_GB_PRO ?? "100", 10)),
  },

  /** Resend API key for sending verification and password reset emails. If unset, verification is skipped. */
  resendApiKey: process.env.RESEND_API_KEY ?? "",

  /** Resend "from" address. Default onboarding@resend.dev only delivers to the Resend account owner. To send to any user, verify a domain at resend.com/domains and set e.g. "iHostMC <noreply@yourdomain.com>". */
  resendFrom: process.env.RESEND_FROM ?? "iHostMC <onboarding@resend.dev>",

  /** Public website URL for verification and reset links (e.g. https://app.ihostmc.com) */
  websiteUrl: process.env.WEBSITE_URL ?? "http://localhost:3000",

  /** WebAuthn: RP ID (domain). Defaults to hostname of WEBSITE_URL. */
  webauthnRpId: process.env.WEBAUTHN_RP_ID || (() => {
    try {
      return new URL(process.env.WEBSITE_URL ?? "http://localhost:3000").hostname || "localhost";
    } catch {
      return "localhost";
    }
  })(),
  /** WebAuthn: origin (e.g. https://ihost.one). Must match the page origin. */
  webauthnOrigin: process.env.WEBAUTHN_ORIGIN || (process.env.WEBSITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),

  /** Dev only: allow POST /api/dev/set-tier to override subscription tier without Stripe */
  allowDevTierOverride: process.env.ALLOW_DEV_TIER_OVERRIDE === "true",

  /** Dev only: when set with allowDevTierOverride, skip AI usage limit so advisor works in dev */
  allowDevAiUnlimited: process.env.ALLOW_DEV_AI_UNLIMITED === "true",

  /** Secret required in header X-Dev-Tier-Secret when calling /api/dev/set-tier */
  devTierOverrideSecret: process.env.DEV_TIER_OVERRIDE_SECRET ?? "",

  /** Optional: only these emails can use dev tier override (comma-separated). Empty = any authenticated user when override is enabled. */
  devTierOverrideEmails: (process.env.DEV_TIER_OVERRIDE_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  /** OAuth: public URL of this backend for redirect_uri (e.g. https://api.ihostmc.com). Required for social login. */
  oauthRedirectBase: (process.env.BACKEND_PUBLIC_URL ?? process.env.WEBSITE_URL ?? "http://localhost:3010").replace(/\/$/, ""),

  /** reCAPTCHA v2 secret key for login, signup, forgot/reset password. When set, those endpoints require a valid token. */
  recaptchaSecretKey: process.env.RECAPTCHA_SECRET_KEY ?? "",

  /** OAuth provider client IDs and secrets (optional; if unset, that provider is disabled) */
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID ?? "",
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      tenant: process.env.MICROSOFT_TENANT_ID ?? "common",
    },
  },
} as const;

export function hasStripe(): boolean {
  return Boolean(config.stripeSecretKey);
}

export function hasStripeTest(): boolean {
  return Boolean(config.stripeTestSecretKey);
}

export function hasEncryption(): boolean {
  return Boolean(config.encryptionKey && config.encryptionKey.length >= 32);
}
