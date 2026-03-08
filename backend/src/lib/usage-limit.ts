/**
 * Shared usage limit checks for AI and other usage-recorded endpoints.
 * Used by routes/usage.ts and routes/ai.ts. Keeps tier/limit/simulate logic in one place.
 */

import { query } from "../db/pool.js";
import { getEffectiveTier } from "../tier-resolver.js";

export function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getUsageLimit(userId: string): Promise<number> {
  const t = await getEffectiveTier(userId);
  return t.apiRequestsPerMonth;
}

export async function getUsageThisMonth(userId: string): Promise<number> {
  const since = currentPeriodStart().toISOString();
  const result = await query<{ total: string }>(
    `SELECT COALESCE(SUM(units), 0)::text AS total FROM usage_events WHERE user_id = $1 AND created_at >= $2`,
    [userId, since]
  );
  return parseInt(result.rows[0]?.total ?? "0", 10);
}

const AI_EVENT_PREFIX = "ai_";

/** AI usage this month (events whose type starts with "ai_"). Used for Pro AI credit limit. */
export async function getAiUsageThisMonth(userId: string): Promise<number> {
  const since = currentPeriodStart().toISOString();
  const result = await query<{ total: string }>(
    `SELECT COALESCE(SUM(units), 0)::text AS total FROM usage_events
     WHERE user_id = $1 AND created_at >= $2 AND event_type LIKE $3`,
    [userId, since, AI_EVENT_PREFIX + "%"]
  );
  return parseInt(result.rows[0]?.total ?? "0", 10);
}

/** AI limit for this user: tier AI credits per month + purchased balance. */
export async function getAiLimit(userId: string): Promise<number> {
  const t = await getEffectiveTier(userId);
  let balance = 0;
  try {
    const row = await query<{ ai_credits_balance: string }>(
      "SELECT ai_credits_balance::text FROM users WHERE id = $1",
      [userId]
    );
    balance = parseInt(row.rows[0]?.ai_credits_balance ?? "0", 10);
  } catch {
    // column may not exist
  }
  return t.aiCreditsPerMonth + Math.max(0, balance);
}

export async function isSimulateAtLimit(userId: string): Promise<boolean> {
  try {
    const row = await query<{ user_id: string }>(
      "SELECT user_id FROM admin_simulate_limit WHERE user_id = $1",
      [userId]
    );
    return !!row.rows[0];
  } catch {
    return false;
  }
}

export async function recordUsage(
  userId: string,
  eventType: string,
  units: number,
  metadata: Record<string, unknown> | null = null
): Promise<void> {
  await query(
    "INSERT INTO usage_events (user_id, event_type, units, metadata) VALUES ($1, $2, $3, $4)",
    [userId, eventType, units, metadata ? JSON.stringify(metadata) : null]
  );
}
