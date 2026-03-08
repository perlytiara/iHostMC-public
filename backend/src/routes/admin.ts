import { Router, Request, Response } from "express";
import { query } from "../db/pool.js";
import { authMiddleware } from "../middleware/auth.js";
import { adminMiddleware } from "../middleware/admin.js";
import { getEffectiveTier } from "../tier-resolver.js";
import { getTierById } from "../tiers.js";

const router = Router();

router.use(authMiddleware);
router.use(adminMiddleware);

/** Current period start (first day of current month UTC). */
function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** GET /api/admin/me – confirm admin (used by website to show Admin nav). */
router.get("/me", (_req: Request, res: Response): void => {
  res.json({ admin: true });
});

/** GET /api/admin/usage/overview – aggregate usage and per-user list (admin only). */
router.get("/usage/overview", async (_req: Request, res: Response): Promise<void> => {
  const since = currentPeriodStart().toISOString();
  const periodStart = currentPeriodStart();

  const totalResult = await query<{ total_units: string }>(
    `SELECT COALESCE(SUM(units), 0)::text AS total_units
     FROM usage_events WHERE created_at >= $1`,
    [since]
  );
  const totalRequests = parseInt(totalResult.rows[0]?.total_units ?? "0", 10);

  const byUserResult = await query<{
    user_id: string;
    email: string;
    total_units: string;
  }>(
    `SELECT u.id AS user_id, u.email, COALESCE(SUM(ue.units), 0)::text AS total_units
     FROM users u
     LEFT JOIN usage_events ue ON ue.user_id = u.id AND ue.created_at >= $1
     GROUP BY u.id, u.email
     ORDER BY (COALESCE(SUM(ue.units), 0)) DESC`,
    [since]
  );

  let simulatedUserIds = new Set<string>();
  try {
    const simulatedResult = await query<{ user_id: string }>("SELECT user_id FROM admin_simulate_limit");
    simulatedUserIds = new Set(simulatedResult.rows.map((r) => r.user_id));
  } catch {
    // table may not exist before migration 015
  }

  const users: { userId: string; email: string; used: number; limit: number; tierId: string; simulateAtLimit: boolean }[] = [];
  for (const row of byUserResult.rows) {
    const tier = await getEffectiveTier(row.user_id);
    users.push({
      userId: row.user_id,
      email: row.email ?? "",
      used: parseInt(row.total_units, 10),
      limit: tier.apiRequestsPerMonth,
      tierId: tier.id,
      simulateAtLimit: simulatedUserIds.has(row.user_id),
    });
  }

  res.json({
    since,
    periodStart: periodStart.toISOString(),
    totalRequests,
    users,
  });
});

/** POST /api/admin/usage/simulate-limit – set or clear "simulate at limit" for a user. Body: { userId: string, simulate: boolean }. */
router.post("/usage/simulate-limit", async (req: Request, res: Response): Promise<void> => {
  const { userId, simulate } = req.body as { userId?: string; simulate?: boolean };
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId required" });
    return;
  }
  if (typeof simulate !== "boolean") {
    res.status(400).json({ error: "simulate required (boolean)" });
    return;
  }
  try {
    if (simulate) {
      await query(
        "INSERT INTO admin_simulate_limit (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
        [userId]
      );
    } else {
      await query("DELETE FROM admin_simulate_limit WHERE user_id = $1", [userId]);
    }
    res.json({ ok: true, userId, simulate });
  } catch {
    res.status(500).json({ error: "Failed to update simulate limit" });
  }
});

/** GET /api/admin/users – list users (optional ?email= or ?username= to find one). Returns id, email, username, effective tier. */
router.get("/users", async (req: Request, res: Response): Promise<void> => {
  const email = typeof req.query.email === "string" ? req.query.email.trim() : undefined;
  const username = typeof req.query.username === "string" ? req.query.username.trim() : undefined;
  try {
    let rows: { id: string; email: string; username: string | null }[];
    if (email) {
      const r = await query<{ id: string; email: string; username: string | null }>(
        "SELECT id, email, username FROM users WHERE LOWER(email) = LOWER($1)",
        [email]
      );
      rows = r.rows;
    } else if (username) {
      const r = await query<{ id: string; email: string; username: string | null }>(
        "SELECT id, email, username FROM users WHERE username IS NOT NULL AND LOWER(username) = LOWER($1)",
        [username]
      );
      rows = r.rows;
    } else {
      const r = await query<{ id: string; email: string; username: string | null }>(
        "SELECT id, email, username FROM users ORDER BY created_at DESC LIMIT 500"
      );
      rows = r.rows;
    }
    const users: { userId: string; email: string; username: string | null; tierId: string }[] = [];
    for (const row of rows) {
      const tier = await getEffectiveTier(row.id);
      users.push({
        userId: row.id,
        email: row.email,
        username: row.username ?? null,
        tierId: tier.id,
      });
    }
    res.json({ users });
  } catch {
    res.status(500).json({ error: "Failed to list users" });
  }
});

/** POST /api/admin/users/set-tier – set dev tier override for a user. Body: { userId?: string, email?: string, username?: string, tierId: string }. */
router.post("/users/set-tier", async (req: Request, res: Response): Promise<void> => {
  const { userId, email, username, tierId } = req.body as {
    userId?: string;
    email?: string;
    username?: string;
    tierId?: string;
  };
  const provided = [userId, email, username].filter(Boolean).length;
  if (provided !== 1) {
    res.status(400).json({ error: "Provide exactly one of userId, email, or username" });
    return;
  }
  const validTiers = ["free", "backup", "pro"];
  if (!tierId || !validTiers.includes(tierId)) {
    res.status(400).json({ error: "tierId must be one of: free, backup, pro" });
    return;
  }
  if (getTierById(tierId) == null) {
    res.status(400).json({ error: "Invalid tierId" });
    return;
  }
  try {
    let targetUserId: string | null = null;
    if (userId && typeof userId === "string") {
      const r = await query<{ id: string }>("SELECT id FROM users WHERE id = $1", [userId]);
      targetUserId = r.rows[0]?.id ?? null;
    } else if (email && typeof email === "string") {
      const r = await query<{ id: string }>("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [email.trim()]);
      targetUserId = r.rows[0]?.id ?? null;
    } else if (username && typeof username === "string") {
      const r = await query<{ id: string }>(
        "SELECT id FROM users WHERE username IS NOT NULL AND LOWER(username) = LOWER($1)",
        [username.trim()]
      );
      targetUserId = r.rows[0]?.id ?? null;
    }
    if (!targetUserId) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await query(
      `INSERT INTO dev_tier_overrides (user_id, tier_id) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET tier_id = EXCLUDED.tier_id`,
      [targetUserId, tierId]
    );
    res.json({ ok: true, userId: targetUserId, tierId });
  } catch {
    res.status(500).json({ error: "Failed to set tier" });
  }
});

/** DELETE /api/admin/users/:userId/tier – remove dev tier override for a user. */
router.delete("/users/:userId/tier", async (req: Request, res: Response): Promise<void> => {
  const targetUserId = req.params.userId;
  if (!targetUserId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  try {
    const r = await query("DELETE FROM dev_tier_overrides WHERE user_id = $1 RETURNING user_id", [targetUserId]);
    if (r.rowCount === 0) {
      res.status(404).json({ error: "No tier override found for this user" });
      return;
    }
    res.json({ ok: true, userId: targetUserId });
  } catch {
    res.status(500).json({ error: "Failed to remove tier override" });
  }
});

export default router;
