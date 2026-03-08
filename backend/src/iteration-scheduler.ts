import { query } from "./db/pool.js";
import { createArchiveFromSync } from "./lib/sync-archive.js";
import { formatIterationName, isDue, type IterationType } from "./lib/sync-iteration.js";

const RUN_INTERVAL_MS = 15 * 60 * 1000; // 15 min

interface SyncServerIterationRow {
  id: string;
  user_id: string;
  name: string;
  iteration_every3h: boolean;
  iteration_daily: boolean;
  iteration_weekly: boolean;
  iteration_last_3h_at: string | null;
  iteration_last_daily_at: string | null;
  iteration_last_weekly_at: string | null;
  metadata: unknown;
}

function getMeta(row: SyncServerIterationRow): Record<string, unknown> {
  return (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
}

async function runIterationJob(): Promise<void> {
  let rows: SyncServerIterationRow[];
  try {
    const result = await query<SyncServerIterationRow>(
      `SELECT id, user_id, name,
        iteration_every3h, iteration_daily, iteration_weekly,
        iteration_last_3h_at, iteration_last_daily_at, iteration_last_weekly_at,
        metadata
       FROM sync_servers
       WHERE (trashed_at IS NULL)
         AND (iteration_every3h = true OR iteration_daily = true OR iteration_weekly = true
         OR (metadata->'iterationMonthly') = 'true'::jsonb
         OR (metadata->>'iterationMonthly') = 'true')`
    );
    rows = result.rows;
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (msg.includes("iteration_every3h") || msg.includes("trashed_at") || msg.includes("does not exist")) {
      return; // migration 013 or 018 not applied yet
    }
    console.error("[iteration-scheduler] query failed:", msg);
    return;
  }

  const now = new Date();
  for (const row of rows) {
    const meta = getMeta(row);
    const intervalHours = typeof meta.iterationIntervalHours === "number"
      ? Math.min(24, Math.max(1, meta.iterationIntervalHours))
      : 1;
    const monthlyDay = typeof meta.iterationMonthlyDay === "number" ? Math.min(31, Math.max(1, meta.iterationMonthlyDay)) : 1;
    const iterationMonthly = meta.iterationMonthly === true;
    const lastMonthly = typeof meta.iterationLastMonthlyAt === "string" ? meta.iterationLastMonthlyAt : null;

    const types: IterationType[] = ["3h", "daily", "weekly", "monthly"];
    const enabled = [
      row.iteration_every3h === true,
      row.iteration_daily === true,
      row.iteration_weekly === true,
      iterationMonthly,
    ];
    const lastRuns = [
      row.iteration_last_3h_at,
      row.iteration_last_daily_at,
      row.iteration_last_weekly_at,
      lastMonthly,
    ];
    const opts = [
      { intervalHours },
      undefined,
      undefined,
      { monthlyDay },
    ];

    let didRun = false;
    for (let i = 0; i < types.length && !didRun; i++) {
      if (!enabled[i]) continue;
      if (!isDue(lastRuns[i] ?? undefined, types[i]!, opts[i])) continue;

      const name = formatIterationName(row.name, types[i]!, now);
      const saveTier =
        meta.iterationSaveTier === "snapshot" || meta.iterationSaveTier === "structural" || meta.iterationSaveTier === "full"
          ? meta.iterationSaveTier
          : undefined;
      const result = await createArchiveFromSync(row.user_id, row.id, name, { iterationType: types[i]!, saveTier });
      if (!result) continue;

      didRun = true;
      if (types[i] === "3h") {
        await query(
          `UPDATE sync_servers SET iteration_last_3h_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2`,
          [row.id, row.user_id]
        );
      } else if (types[i] === "daily") {
        await query(
          `UPDATE sync_servers SET iteration_last_daily_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2`,
          [row.id, row.user_id]
        );
      } else if (types[i] === "weekly") {
        await query(
          `UPDATE sync_servers SET iteration_last_weekly_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2`,
          [row.id, row.user_id]
        );
      } else {
        const merged = { ...meta, iterationLastMonthlyAt: new Date().toISOString() };
        await query(
          `UPDATE sync_servers SET metadata = $1::jsonb, updated_at = now() WHERE id = $2 AND user_id = $3`,
          [JSON.stringify(merged), row.id, row.user_id]
        );
      }
    }
  }
}

export function startIterationScheduler(): void {
  runIterationJob().catch((e) => console.error("[iteration-scheduler] run failed:", e));
  setInterval(() => {
    runIterationJob().catch((e) => console.error("[iteration-scheduler] run failed:", e));
  }, RUN_INTERVAL_MS);
}
