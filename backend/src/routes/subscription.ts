import { Router, Request, Response } from "express";
import { query } from "../db/pool.js";
import { getTierById, getTierByPriceId, getFreeTier } from "../tiers.js";
import { authMiddleware } from "../middleware/auth.js";
import { getEffectiveTier } from "../tier-resolver.js";

const router = Router();

function tierToJson(t: ReturnType<typeof getFreeTier>) {
  return {
    id: t.id,
    name: t.name,
    priceUsd: t.priceUsd,
    maxServers: t.maxServers,
    aiIncluded: t.aiIncluded,
    aiCreditsPerMonth: t.aiCreditsPerMonth,
    autoBackup: t.autoBackup,
    apiRequestsPerMonth: t.apiRequestsPerMonth,
    description: t.description,
    featureKeys: t.featureKeys,
  };
}

router.get("/status", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  try {
    const overrideRow = await query<{ tier_id: string }>(
      "SELECT tier_id FROM dev_tier_overrides WHERE user_id = $1",
      [userId]
    );
    if (overrideRow.rows[0]) {
      const currentTier = getTierById(overrideRow.rows[0].tier_id) ?? getFreeTier();
      const periodEnd = new Date();
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      res.json({
        status: "active",
        currentPeriodEnd: periodEnd.toISOString(),
        endsAtPeriodEnd: false,
        stripePriceId: null,
        devOverride: true,
        tierId: currentTier.id,
        tier: tierToJson(currentTier),
      });
      return;
    }

    const result = await query<{ status: string; current_period_end: string | null; stripe_price_id: string | null }>(
      "SELECT status, current_period_end, stripe_price_id FROM subscriptions WHERE user_id = $1",
      [userId]
    );
    const row = result.rows[0];
    const status = row?.status ?? "inactive";
    const currentPeriodEnd = row?.current_period_end ?? null;
    const stripePriceId = row?.stripe_price_id ?? null;
    const periodEndInFuture = currentPeriodEnd && new Date(currentPeriodEnd) > new Date();
    const tier =
      status === "active"
        ? getTierByPriceId(stripePriceId)
        : status === "canceled" && periodEndInFuture
          ? getTierByPriceId(stripePriceId)
          : null;
    const currentTier = tier ?? getFreeTier();
    res.json({
      status,
      currentPeriodEnd,
      endsAtPeriodEnd: status === "canceled" && periodEndInFuture,
      stripePriceId,
      tierId: currentTier.id,
      tier: tierToJson(currentTier),
    });
  } catch {
    res.status(500).json({ error: "Failed to get subscription status" });
  }
});

export default router;
