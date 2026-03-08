/**
 * Iteration naming and due logic for backend cron (matches app iteration-prefs).
 */

export type IterationType = "3h" | "daily" | "weekly" | "monthly";

function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return { year: d.getUTCFullYear(), week: weekNo };
}

/** Format iteration backup name (same as app): ServerName_2025-02-28_12-00_3h, etc. */
export function formatIterationName(
  serverName: string,
  type: IterationType,
  at: Date = new Date()
): string {
  const safe = serverName.replace(/[^\w\s-]/g, "").trim() || "Server";
  const suffix = type === "3h" ? "3h" : type === "daily" ? "daily" : type === "weekly" ? "weekly" : "monthly";

  if (type === "3h") {
    const date = at.toISOString().slice(0, 10);
    const time = at.toTimeString().slice(0, 5).replace(":", "-");
    return `${safe}_${date}_${time}_${suffix}`;
  }
  if (type === "daily") {
    const date = at.toISOString().slice(0, 10);
    return `${safe}_${date}_${suffix}`;
  }
  if (type === "monthly") {
    const y = at.getFullYear();
    const m = String(at.getMonth() + 1).padStart(2, "0");
    return `${safe}_${y}-${m}_${suffix}`;
  }
  const { year, week } = getISOWeek(at);
  const weekStr = week < 10 ? `0${week}` : String(week);
  return `${safe}_${year}-W${weekStr}_${suffix}`;
}

/** Interval in ms for 3h type; pass hours for flexible interval (3, 6, 12). */
export function getIntervalMsHours(hours: number): number {
  return hours * 60 * 60 * 1000;
}

export function getNextRunAt(
  lastRun: string | null | undefined,
  type: IterationType,
  opts?: { intervalHours?: number; monthlyDay?: number }
): Date | null {
  if (!lastRun) return null;
  const last = new Date(lastRun).getTime();
  const now = Date.now();
  if (type === "3h") {
    const hours = Math.min(24, Math.max(1, opts?.intervalHours ?? 1));
    const ms = getIntervalMsHours(hours);
    return new Date(last + ms);
  }
  if (type === "daily") {
    return new Date(last + 24 * 60 * 60 * 1000);
  }
  if (type === "weekly") {
    return new Date(last + 7 * 24 * 60 * 60 * 1000);
  }
  if (type === "monthly") {
    const lastDate = new Date(last);
    const day = Math.min(31, Math.max(1, opts?.monthlyDay ?? 1));
    let nextMonthIdx = lastDate.getMonth() + 1;
    let nextYear = lastDate.getFullYear();
    if (nextMonthIdx > 11) {
      nextMonthIdx = 0;
      nextYear += 1;
    }
    const daysInNextMonth = new Date(nextYear, nextMonthIdx + 1, 0).getDate();
    const safeDay = Math.min(day, daysInNextMonth);
    return new Date(nextYear, nextMonthIdx, safeDay);
  }
  return null;
}

export function isDue(
  lastRun: string | null | undefined,
  type: IterationType,
  opts?: { intervalHours?: number; monthlyDay?: number }
): boolean {
  if (!lastRun) return true;
  const next = getNextRunAt(lastRun, type, opts);
  return next !== null && next.getTime() <= Date.now();
}
