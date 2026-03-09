/**
 * Automatic backup iterations: per-server schedule and last run times.
 * Stored in localStorage; keyed by server host id (app server id).
 */

const STORAGE_KEY = "ihostmc-iterations-v1";

/** localStorage key for "enable automatic iterations for new servers" (default false – user can archive manually). */
export const ITERATIONS_NEW_SERVERS_KEY = "ihostmc-iterations-new-servers";

export type IterationType = "3h" | "daily" | "weekly" | "monthly";

export const INTERVAL_HOURS_MIN = 1;
export const INTERVAL_HOURS_MAX = 24;
/** Default 1 = Hourly (matches website). */
export const INTERVAL_HOURS_DEFAULT = 1;

/** Save tier used when creating iteration backups (hourly/daily/weekly/monthly). */
export type IterationSaveTier = "snapshot" | "structural" | "full";

export interface ServerIterationSchedule {
  /** Create a snapshot every N hours (default off). Uses intervalHours; backend uses "every3h" flag. */
  every3h: boolean;
  /** Create a snapshot every 24 hours (default off). */
  daily: boolean;
  /** Create a snapshot every 7 days (default off). */
  weekly: boolean;
  /** Create a snapshot every month (default off). */
  monthly: boolean;
  /** Last run timestamps (ISO) per type; used to decide when next run is due. */
  lastRun?: {
    "3h"?: string;
    daily?: string;
    weekly?: string;
    monthly?: string;
  };
  /** Optional: daily at this time (HH:mm, 24h). E.g. "10:39" = 10:39 AM. */
  dailyAt?: string;
  /** Optional: weekly on this day (0 = Sunday, 1 = Monday, … 6 = Saturday). */
  weeklyOn?: number;
  /** Interval hours for "3h" type (1–24). Synced with website. */
  intervalHours?: number;
  /** Optional: monthly on this day of month (1–31). */
  monthlyDay?: number;
  /** Optional: monthly at this time (HH:mm). */
  monthlyAt?: string;
  /** Save tier for automatic iterations (snapshot = metadata only; structural = config+mods+plugins; full = everything). Default snapshot. */
  saveTier?: IterationSaveTier;
}

export interface IterationPrefs {
  [serverId: string]: ServerIterationSchedule;
}

const DEFAULT_SCHEDULE: ServerIterationSchedule = {
  every3h: false,
  daily: false,
  weekly: false,
  monthly: false,
};

function load(): IterationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as IterationPrefs;
    return typeof data === "object" && data !== null ? data : {};
  } catch {
    return {};
  }
}

function save(prefs: IterationPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function getIterationsEnabledForNewServers(): boolean {
  try {
    const raw = localStorage.getItem(ITERATIONS_NEW_SERVERS_KEY);
    if (raw === "false") return false;
    if (raw === "true") return true;
  } catch {
    // ignore
  }
  return false;
}

export function setIterationsEnabledForNewServers(enabled: boolean): void {
  try {
    localStorage.setItem(ITERATIONS_NEW_SERVERS_KEY, String(enabled));
  } catch {
    // ignore
  }
}

/** Default schedule to apply when a new server is created. When off, user archives manually; iterations replace old on occurrence when enabled. */
export function getDefaultScheduleForNewServers(): Pick<ServerIterationSchedule, "every3h" | "daily" | "weekly"> {
  const enabled = getIterationsEnabledForNewServers();
  if (enabled) return { every3h: true, daily: true, weekly: true };
  return { every3h: false, daily: false, weekly: false };
}

export function getIterationSchedule(serverId: string): ServerIterationSchedule {
  const prefs = load();
  const existing = prefs[serverId];
  if (existing) return { ...DEFAULT_SCHEDULE, ...existing };
  return { ...DEFAULT_SCHEDULE };
}

export function setIterationSchedule(
  serverId: string,
  schedule: Partial<ServerIterationSchedule>
): void {
  const prefs = load();
  const current = prefs[serverId] ?? { ...DEFAULT_SCHEDULE };
  prefs[serverId] = { ...current, ...schedule };
  save(prefs);
}

export function setLastRun(serverId: string, type: IterationType, at: string): void {
  const prefs = load();
  const current = prefs[serverId] ?? { ...DEFAULT_SCHEDULE };
  const key = type === "3h" ? "3h" : type;
  const lastRun = { ...current.lastRun, [key]: at };
  prefs[serverId] = { ...current, lastRun };
  save(prefs);
}

export interface GetNextRunAtOptions {
  dailyAt?: string;
  weeklyOn?: number;
  intervalHours?: number;
  monthlyDay?: number;
  monthlyAt?: string;
}

/**
 * Next run time. If dailyAt (HH:mm) is set, daily next run is that time on the next calendar day.
 * If weeklyOn (0–6) is set, weekly next run is that weekday. intervalHours used for 3h type. monthlyDay/monthlyAt for monthly.
 */
export function getNextRunAt(
  lastRun: string | undefined,
  type: IterationType,
  options?: GetNextRunAtOptions
): Date | null {
  if (type === "3h") {
    if (!lastRun) return null;
    const hours = Math.min(INTERVAL_HOURS_MAX, Math.max(INTERVAL_HOURS_MIN, options?.intervalHours ?? INTERVAL_HOURS_DEFAULT));
    const last = new Date(lastRun).getTime();
    return new Date(last + hours * 60 * 60 * 1000);
  }
  if (type === "daily") {
    const now = new Date();
    if (options?.dailyAt) {
      const [h, m] = options.dailyAt.split(":").map((x) => parseInt(x, 10) || 0);
      let next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
      if (next.getTime() <= now.getTime()) next = new Date(next.getTime() + 24 * 60 * 60 * 1000);
      return next;
    }
    if (!lastRun) return null;
    const last = new Date(lastRun).getTime();
    return new Date(last + 24 * 60 * 60 * 1000);
  }
  if (type === "weekly") {
    const now = new Date();
    if (typeof options?.weeklyOn === "number") {
      const targetDay = options.weeklyOn; // 0 = Sun, 6 = Sat
      const currentDay = now.getDay();
      let daysAhead = targetDay - currentDay;
      if (daysAhead <= 0) daysAhead += 7;
      const next = new Date(now);
      next.setDate(next.getDate() + daysAhead);
      next.setHours(0, 0, 0, 0);
      if (lastRun) {
        const last = new Date(lastRun);
        next.setHours(last.getHours(), last.getMinutes(), last.getSeconds(), last.getMilliseconds());
      }
      if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 7);
      return next;
    }
    if (!lastRun) return null;
    const last = new Date(lastRun).getTime();
    return new Date(last + 7 * 24 * 60 * 60 * 1000);
  }
  if (type === "monthly") {
    const now = new Date();
    const day = Math.min(31, Math.max(1, options?.monthlyDay ?? 1));
    const [h, min] = (options?.monthlyAt ?? "02:00").split(":").map((x) => parseInt(x, 10) || 0);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const safeDay = Math.min(day, daysInMonth);
    let next = new Date(now.getFullYear(), now.getMonth(), safeDay, h, min, 0, 0);
    if (next.getTime() <= now.getTime()) {
      const nextMonthDays = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
      next = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(day, nextMonthDays), h, min, 0, 0);
    }
    return next;
  }
  return null;
}

/** ISO week number (1–53) for a date; week 1 = week containing first Thursday of year. */
function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7; // 1 = Mon, 7 = Sun
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of this week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return { year: d.getUTCFullYear(), week: weekNo };
}

/**
 * Format iteration backup name per type (sortable, identifiable); matches backend.
 * - 3h:    ServerName_2025-02-28_12-00_3h
 * - daily: ServerName_2025-02-28_daily
 * - weekly: ServerName_2025-W09_weekly
 * - monthly: ServerName_2025-02_monthly
 */
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