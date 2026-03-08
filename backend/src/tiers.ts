/**
 * Billing tiers: Free, Backup ($3.99/mo), Pro ($11.99/mo with AI credits).
 * Backup = server settings, mods/plugins lists, version, server files (not world).
 * World backup is a separate product (e.g. our server/hardware offering).
 * Pro = AI features + monthly credits.
 */

export interface Tier {
  id: string;
  name: string;
  /** Display price in USD/EUR (0 for free). */
  priceUsd: number;
  /** Stripe Price ID (recurring). Null for free. */
  stripePriceId: string | null;
  maxServers: number;
  aiIncluded: boolean;
  /** AI credits per month (Pro only). */
  aiCreditsPerMonth: number;
  autoBackup: boolean;
  apiRequestsPerMonth: number;
  description: string;
  featureKeys: string[];
}

function envPriceId(key: string): string | null {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : null;
}

const UNLIMITED_SERVERS = 999;

/**
 * Canonical feature list (same order for all tiers). Each tier shows a progressive subset:
 * Free = first 3, Backup = first 4, Pro = all 5. Positive framing only.
 */
export const TIER_FEATURE_KEYS = [
  "tierFeatureModloader",
  "tierFeatureModsPlugins",
  "tierFeatureNoPortForward",
  "tierFeatureBackup",
  "tierFeatureAi",
] as const;

/** Tiers in display order: free first, then Backup, then Pro. Features are progressive (more as you go). */
export function getTiers(): Tier[] {
  return [
    {
      id: "free",
      name: "Free",
      priceUsd: 0,
      stripePriceId: null,
      maxServers: UNLIMITED_SERVERS,
      aiIncluded: false,
      aiCreditsPerMonth: 0,
      autoBackup: false,
      apiRequestsPerMonth: 50,
      description: "Host servers, mods & plugins, play without port forwarding",
      featureKeys: ["tierFeatureModloader", "tierFeatureModsPlugins", "tierFeatureNoPortForward"],
    },
    {
      id: "backup",
      name: "Backup",
      priceUsd: 3.99,
      stripePriceId: envPriceId("STRIPE_PRICE_ID_BACKUP"),
      maxServers: UNLIMITED_SERVERS,
      aiIncluded: false,
      aiCreditsPerMonth: 0,
      autoBackup: true,
      apiRequestsPerMonth: 500,
      description: "Everything in Free plus cloud backup or connect your own (e.g. Google Drive)",
      featureKeys: ["tierFeatureModloader", "tierFeatureModsPlugins", "tierFeatureNoPortForward", "tierFeatureBackup"],
    },
    {
      id: "pro",
      name: "Pro",
      priceUsd: 11.99,
      stripePriceId: envPriceId("STRIPE_PRICE_ID_PRO"),
      maxServers: UNLIMITED_SERVERS,
      aiIncluded: true,
      aiCreditsPerMonth: 500,
      autoBackup: true,
      apiRequestsPerMonth: 10000,
      description: "Everything in Backup plus AI features and 500 free credits/month; buy more anytime",
      featureKeys: ["tierFeatureModloader", "tierFeatureModsPlugins", "tierFeatureNoPortForward", "tierFeatureBackup", "tierFeatureAi"],
    },
  ];
}

/** Pro tier (id: pro). */
export function getProTier(): Tier {
  return getTiers().find((t) => t.id === "pro")!;
}

/** Backup tier (id: backup). */
export function getBackupTier(): Tier {
  return getTiers().find((t) => t.id === "backup")!;
}

/** Resolve tier by Stripe Price ID (from subscription). */
export function getTierByPriceId(priceId: string | null): Tier | null {
  if (!priceId) return null;
  const tiers = getTiers();
  const match = tiers.find((t) => t.stripePriceId === priceId);
  if (match) return match;
  const legacyStarter = envPriceId("STRIPE_PRICE_ID_STARTER");
  const legacyBackup = envPriceId("STRIPE_PRICE_ID_BACKUP");
  if (priceId === legacyBackup) return getBackupTier();
  if (priceId === legacyStarter) return getProTier();
  return getProTier();
}

/** Free tier (id: free). */
export function getFreeTier(): Tier {
  return getTiers().find((t) => t.id === "free")!;
}

/** Resolve tier by id (for dev override). Returns null if invalid. */
export function getTierById(tierId: string | null): Tier | null {
  if (!tierId) return null;
  return getTiers().find((t) => t.id === tierId) ?? null;
}
