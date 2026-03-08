import { Router, Request, Response } from "express";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import { authMiddleware } from "../middleware/auth.js";
import { getEffectiveTier } from "../tier-resolver.js";
import {
  currentPeriodStart,
  getUsageLimit,
  getUsageThisMonth,
  isSimulateAtLimit,
  recordUsage,
} from "../lib/usage-limit.js";

const router = Router();

router.use(authMiddleware);

/** Event types that count as AI usage. Only Pro tier (aiIncluded) can record these. */
const AI_EVENT_PREFIX = "ai_";

/** Record a usage event (e.g. API/AI request). Enforces monthly request limit by tier. AI events only allowed for Pro. */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { eventType, units, metadata } = req.body as {
    eventType?: string;
    units?: number;
    metadata?: Record<string, unknown>;
  };
  if (!eventType || typeof eventType !== "string") {
    res.status(400).json({ error: "eventType required" });
    return;
  }
  const isAiEvent = eventType.toLowerCase().startsWith(AI_EVENT_PREFIX);
  if (isAiEvent) {
    const tier = await getEffectiveTier(userId);
    if (!tier.aiIncluded) {
      res.status(403).json({
        error: "AI features require Pro. Upgrade to use AI.",
        code: "AI_PRO_ONLY",
        tierId: tier.id,
      });
      return;
    }
  }
  const u = typeof units === "number" && units > 0 ? units : 1;
  try {
    const simulateAtLimit = await isSimulateAtLimit(userId);
    if (simulateAtLimit) {
      const limit = await getUsageLimit(userId);
      const used = await getUsageThisMonth(userId);
      res.status(402).json({
        error: "Monthly request limit reached (simulated by admin)",
        limit,
        used,
        upgradeUrl: "/dashboard",
        priceUsd: config.billingPriceUsd,
      });
      return;
    }
    const [used, limit] = await Promise.all([getUsageThisMonth(userId), getUsageLimit(userId)]);
    if (used + u > limit) {
      res.status(402).json({
        error: "Monthly request limit reached",
        limit,
        used,
        upgradeUrl: "/dashboard",
        priceUsd: config.billingPriceUsd,
      });
      return;
    }
    await recordUsage(userId, eventType, u, metadata ?? null);
    res.status(201).json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to record usage" });
  }
});

/** Get usage summary for current period. Includes summary by day (for dashboard graph), AI credits balance, and AI used this month. */
router.get("/summary", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const period = (req.query.period as string) || "month";
  let since: string;
  if (period === "month") {
    since = currentPeriodStart().toISOString();
  } else {
    since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  const result = await query<{ event_type: string; total_units: string }>(
    `SELECT event_type, SUM(units)::text AS total_units
     FROM usage_events
     WHERE user_id = $1 AND created_at >= $2
     GROUP BY event_type`,
    [userId, since]
  );
  const summary: Record<string, number> = {};
  let aiUsedThisMonth = 0;
  for (const row of result.rows) {
    const total = parseInt(row.total_units, 10);
    summary[row.event_type] = total;
    if (row.event_type.toLowerCase().startsWith(AI_EVENT_PREFIX)) {
      aiUsedThisMonth += total;
    }
  }
  const byDayResult = await query<{ day: string; total_units: string }>(
    `SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day, COALESCE(SUM(units), 0)::text AS total_units
     FROM usage_events
     WHERE user_id = $1 AND created_at >= $2
     GROUP BY date_trunc('day', created_at AT TIME ZONE 'UTC')::date
     ORDER BY day`,
    [userId, since]
  );
  const summaryByDay: Record<string, number> = {};
  for (const row of byDayResult.rows) {
    summaryByDay[row.day] = parseInt(row.total_units, 10);
  }
  const usedThisMonth = await getUsageThisMonth(userId);
  const limit = await getUsageLimit(userId);
  const t = await getEffectiveTier(userId);
  let aiCreditsBalance = 0;
  try {
    const balanceRow = await query<{ ai_credits_balance: string }>(
      "SELECT ai_credits_balance::text FROM users WHERE id = $1",
      [userId]
    );
    aiCreditsBalance = parseInt(balanceRow.rows[0]?.ai_credits_balance ?? "0", 10);
  } catch {
    // column may not exist in older migrations
  }
  res.json({
    period,
    since,
    summary,
    summaryByDay,
    used: usedThisMonth,
    limit,
    tier: t.priceUsd > 0 ? "paid" : "free",
    tierId: t.id,
    priceUsd: config.billingPriceUsd,
    aiCreditsBalance,
    aiUsedThisMonth,
    aiCreditsPerMonth: t.aiCreditsPerMonth,
  });
});

export default router;
