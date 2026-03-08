import { Router, Request, Response } from "express";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import { getTierById } from "../tiers.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

const VALID_TIER_IDS = ["free", "backup", "pro"] as const;

type AuthRequest = Request & { userId: string; userEmail: string };

function devTierAuth(req: Request, res: Response, next: () => void): void {
  if (!config.allowDevTierOverride) {
    res.status(403).json({ error: "Dev tier override is disabled. Set ALLOW_DEV_TIER_OVERRIDE=true." });
    return;
  }
  const secret = req.headers["x-dev-tier-secret"] as string | undefined;
  if (!config.devTierOverrideSecret || secret !== config.devTierOverrideSecret) {
    res.status(403).json({ error: "Missing or invalid X-Dev-Tier-Secret header." });
    return;
  }
  if (config.devTierOverrideEmails.length > 0) {
    const email = (req as AuthRequest).userEmail?.trim().toLowerCase();
    if (!email || !config.devTierOverrideEmails.includes(email)) {
      res.status(403).json({ error: "Dev tier override is not allowed for this account." });
      return;
    }
  }
  next();
}

/** GET /api/dev/can-use-override – whether the authenticated user may use dev tier override (no secret). */
router.get("/can-use-override", authMiddleware, (req: Request, res: Response): void => {
  if (!config.allowDevTierOverride) {
    res.json({ allowed: false });
    return;
  }
  if (config.devTierOverrideEmails.length > 0) {
    const email = (req as AuthRequest).userEmail?.trim().toLowerCase();
    const allowed = Boolean(email && config.devTierOverrideEmails.includes(email));
    res.json({ allowed });
    return;
  }
  res.json({ allowed: true });
});

/**
 * POST /api/dev/set-tier
 * Body: { tierId: "free" | "backup" | "pro" }
 * Requires: auth + X-Dev-Tier-Secret header (and ALLOW_DEV_TIER_OVERRIDE=true).
 * Sets the subscription tier for the authenticated user without Stripe (for local testing).
 */
router.post("/set-tier", authMiddleware, devTierAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthRequest).userId;
  const { tierId } = req.body as { tierId?: string };
  if (!tierId || typeof tierId !== "string") {
    res.status(400).json({ error: "tierId required: 'free', 'backup', or 'pro'" });
    return;
  }
  const normalized = tierId.toLowerCase();
  if (!VALID_TIER_IDS.includes(normalized as (typeof VALID_TIER_IDS)[number])) {
    res.status(400).json({ error: "tierId must be 'free', 'backup', or 'pro'" });
    return;
  }
  try {
    if (normalized === "free") {
      await query("DELETE FROM dev_tier_overrides WHERE user_id = $1", [userId]);
      res.json({ ok: true, tierId: "free", message: "Dev override cleared; account is Free." });
      return;
    }
    const tier = getTierById(normalized);
    if (!tier) {
      res.status(400).json({ error: "Unknown tier" });
      return;
    }
    await query(
      `INSERT INTO dev_tier_overrides (user_id, tier_id) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET tier_id = $2`,
      [userId, normalized]
    );
    res.json({ ok: true, tierId: normalized, tier: tier.name, message: `Dev override set to ${tier.name}.` });
  } catch {
    res.status(500).json({ error: "Failed to set dev tier" });
  }
});

/**
 * GET /api/dev/tier-override
 * Returns current dev override for the authenticated user (if any).
 * Requires: auth + X-Dev-Tier-Secret (and ALLOW_DEV_TIER_OVERRIDE=true).
 */
router.get("/tier-override", authMiddleware, devTierAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthRequest).userId;
  const result = await query<{ tier_id: string }>("SELECT tier_id FROM dev_tier_overrides WHERE user_id = $1", [userId]);
  const row = result.rows[0];
  if (!row) {
    res.json({ override: false, tierId: null });
    return;
  }
  const tier = getTierById(row.tier_id);
  res.json({ override: true, tierId: row.tier_id, tierName: tier?.name ?? row.tier_id });
});

/** Whether the authenticated user can use dev-only features (tier override, Stripe test mode). */
function canUseDevFeatures(req: Request): boolean {
  if (config.devTierOverrideEmails.length === 0) return true;
  const email = (req as AuthRequest).userEmail?.trim().toLowerCase();
  return Boolean(email && config.devTierOverrideEmails.includes(email));
}

/** GET /api/dev/stripe-mode – get current Stripe test mode preference (devs only). */
router.get("/stripe-mode", authMiddleware, (req: Request, res: Response): void => {
  if (!canUseDevFeatures(req)) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }
  const userId = (req as AuthRequest).userId;
  query<{ stripe_test_mode: boolean }>("SELECT stripe_test_mode FROM users WHERE id = $1", [userId])
    .then((r) => {
      const useTestMode = r.rows[0]?.stripe_test_mode ?? false;
      res.json({ useTestMode });
    })
    .catch(() => res.status(500).json({ error: "Failed to get stripe mode" }));
});

/** POST /api/dev/stripe-mode – set Stripe test mode preference (devs only). Body: { useTestMode: boolean } */
router.post("/stripe-mode", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  if (!canUseDevFeatures(req)) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }
  const userId = (req as AuthRequest).userId;
  const useTestMode = req.body?.useTestMode === true;
  try {
    await query("UPDATE users SET stripe_test_mode = $1, updated_at = now() WHERE id = $2", [useTestMode, userId]);
    res.json({ useTestMode });
  } catch {
    res.status(500).json({ error: "Failed to set stripe mode" });
  }
});

export default router;
