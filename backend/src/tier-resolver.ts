import { query } from "./db/pool.js";
import { getTierById, getTierByPriceId, getFreeTier, type Tier } from "./tiers.js";

/**
 * Returns the effective subscription tier for a user.
 * Dev override takes precedence; then Stripe subscription; then free.
 */
export async function getEffectiveTier(userId: string): Promise<Tier> {
  const overrideRow = await query<{ tier_id: string }>(
    "SELECT tier_id FROM dev_tier_overrides WHERE user_id = $1",
    [userId]
  );
  if (overrideRow.rows[0]) {
    const tier = getTierById(overrideRow.rows[0].tier_id);
    if (tier) return tier;
  }

  const subRow = await query<{ status: string; current_period_end: string | null; stripe_price_id: string | null }>(
    "SELECT status, current_period_end, stripe_price_id FROM subscriptions WHERE user_id = $1",
    [userId]
  );
  const row = subRow.rows[0];
  if (!row) return getFreeTier();
  const periodEndInFuture = row.current_period_end && new Date(row.current_period_end) > new Date();
  const active = row.status === "active" || (row.status === "canceled" && periodEndInFuture);
  if (active && row.stripe_price_id) {
    const tier = getTierByPriceId(row.stripe_price_id);
    if (tier) return tier;
  }
  return getFreeTier();
}
