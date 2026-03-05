import { useCallback, useEffect, useRef, useState } from "react";
import { api, getApiBaseUrl, type SyncServerInfo } from "@/lib/api-client";
import {
  getIterationSchedule,
  setIterationSchedule,
  setLastRun,
  getNextRunAt,
  formatIterationName,
  INTERVAL_HOURS_DEFAULT,
  type IterationType,
  type ServerIterationSchedule,
  type IterationSaveTier,
} from "@/lib/iteration-prefs";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 min

function isDue(
  lastRun: string | undefined,
  type: IterationType,
  options?: { dailyAt?: string; weeklyOn?: number; intervalHours?: number; monthlyDay?: number; monthlyAt?: string }
): boolean {
  if (!lastRun) return true;
  const next = getNextRunAt(lastRun, type, options);
  return next !== null && next.getTime() <= Date.now();
}

export interface UseBackupIterationsResult {
  schedule: ServerIterationSchedule;
  setSchedule: (partial: Partial<ServerIterationSchedule>) => void;
  lastRun: ServerIterationSchedule["lastRun"];
  nextRun: { "3h": Date | null; daily: Date | null; weekly: Date | null; monthly: Date | null };
  runNow: (type: IterationType) => Promise<boolean>;
  running: boolean;
  error: string | null;
}

export interface UseBackupIterationsOptions {
  /** Called after a snapshot is created (e.g. to refresh backup list). */
  onIterationCreated?: () => void;
}

export function useBackupIterations(
  token: string | null,
  serverId: string,
  serverName: string,
  backendServerId: string | null,
  options?: UseBackupIterationsOptions & { syncedServer?: SyncServerInfo | null }
): UseBackupIterationsResult {
  const { onIterationCreated, syncedServer } = options ?? {};
  const [schedule, setScheduleState] = useState<ServerIterationSchedule>(() =>
    getIterationSchedule(serverId)
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastCheckRef = useRef(0);

  useEffect(() => {
    setScheduleState(getIterationSchedule(serverId));
  }, [serverId]);

  // Hydrate schedule from backend when syncedServer has iteration data (website ↔ app sync)
  useEffect(() => {
    if (!backendServerId || !syncedServer || syncedServer.id !== backendServerId) return;
    const s = syncedServer;
    const hasBackendSchedule =
      s.iterationEvery3h !== undefined ||
      s.iterationDaily !== undefined ||
      s.iterationWeekly !== undefined ||
      s.iterationMonthly !== undefined ||
      s.iterationLast3hAt !== undefined ||
      s.iterationLastDailyAt !== undefined ||
      s.iterationLastWeeklyAt !== undefined ||
      s.iterationLastMonthlyAt !== undefined ||
      s.iterationDailyAt !== undefined ||
      s.iterationWeeklyOn !== undefined ||
      s.iterationIntervalHours !== undefined ||
      s.iterationMonthlyDay !== undefined ||
      s.iterationMonthlyAt !== undefined ||
      s.iterationSaveTier !== undefined;
    if (!hasBackendSchedule) return;
    const lastRun: NonNullable<ServerIterationSchedule["lastRun"]> = {};
    if (s.iterationLast3hAt != null) lastRun["3h"] = s.iterationLast3hAt;
    if (s.iterationLastDailyAt != null) lastRun.daily = s.iterationLastDailyAt;
    if (s.iterationLastWeeklyAt != null) lastRun.weekly = s.iterationLastWeeklyAt;
    if (s.iterationLastMonthlyAt != null) lastRun.monthly = s.iterationLastMonthlyAt;
    const saveTier: IterationSaveTier | undefined =
      s.iterationSaveTier === "snapshot" || s.iterationSaveTier === "structural" || s.iterationSaveTier === "full"
        ? s.iterationSaveTier
        : undefined;
    const merged: Partial<ServerIterationSchedule> = {
      every3h: s.iterationEvery3h ?? false,
      daily: s.iterationDaily ?? false,
      weekly: s.iterationWeekly ?? false,
      monthly: s.iterationMonthly ?? false,
      dailyAt: s.iterationDailyAt ?? undefined,
      weeklyOn: typeof s.iterationWeeklyOn === "number" ? s.iterationWeeklyOn : 0,
      intervalHours: typeof s.iterationIntervalHours === "number" ? s.iterationIntervalHours : undefined,
      monthlyDay: typeof s.iterationMonthlyDay === "number" ? s.iterationMonthlyDay : undefined,
      monthlyAt: s.iterationMonthlyAt ?? undefined,
      saveTier,
      ...(Object.keys(lastRun).length > 0 && { lastRun }),
    };
    setIterationSchedule(serverId, merged);
    setScheduleState(getIterationSchedule(serverId));
  }, [serverId, backendServerId, syncedServer?.id, syncedServer?.iterationEvery3h, syncedServer?.iterationDaily, syncedServer?.iterationWeekly, syncedServer?.iterationMonthly, syncedServer?.iterationLast3hAt, syncedServer?.iterationLastDailyAt, syncedServer?.iterationLastWeeklyAt, syncedServer?.iterationLastMonthlyAt, syncedServer?.iterationDailyAt, syncedServer?.iterationWeeklyOn, syncedServer?.iterationIntervalHours, syncedServer?.iterationMonthlyDay, syncedServer?.iterationMonthlyAt, syncedServer?.iterationSaveTier]);

  // Sync schedule to backend when we have token + backendServerId (syncs with website)
  useEffect(() => {
    if (!token || !backendServerId || !getApiBaseUrl()) return;
    const s = getIterationSchedule(serverId);
    const body: {
      every3h: boolean;
      daily: boolean;
      weekly: boolean;
      dailyAt?: string;
      weeklyOn?: number;
      intervalHours?: number;
      monthly?: boolean;
      monthlyDay?: number;
      monthlyAt?: string;
      saveTier?: "snapshot" | "structural" | "full";
    } = { every3h: s.every3h, daily: s.daily, weekly: s.weekly };
    if (s.dailyAt) body.dailyAt = s.dailyAt;
    if (s.weeklyOn !== undefined) body.weeklyOn = s.weeklyOn;
    if (typeof s.intervalHours === "number") body.intervalHours = s.intervalHours;
    if (s.monthly !== undefined) body.monthly = s.monthly;
    if (typeof s.monthlyDay === "number") body.monthlyDay = s.monthlyDay;
    if (s.monthlyAt) body.monthlyAt = s.monthlyAt;
    if (s.saveTier) body.saveTier = s.saveTier;
    api.patchIteration(token, backendServerId, body).catch(() => {});
  }, [serverId, token, backendServerId]);

  const setSchedule = useCallback(
    (partial: Partial<ServerIterationSchedule>) => {
      setIterationSchedule(serverId, partial);
      const next = getIterationSchedule(serverId);
      setScheduleState(next);
      if (token && backendServerId && getApiBaseUrl()) {
        const body: {
          every3h?: boolean;
          daily?: boolean;
          weekly?: boolean;
          dailyAt?: string;
          weeklyOn?: number;
          intervalHours?: number;
          monthly?: boolean;
          monthlyDay?: number;
          monthlyAt?: string;
        } = {};
        if (partial.every3h !== undefined) body.every3h = partial.every3h;
        if (partial.daily !== undefined) body.daily = partial.daily;
        if (partial.weekly !== undefined) body.weekly = partial.weekly;
        if (partial.dailyAt !== undefined) body.dailyAt = partial.dailyAt;
        if (partial.weeklyOn !== undefined) body.weeklyOn = partial.weeklyOn;
        if (partial.intervalHours !== undefined) body.intervalHours = partial.intervalHours;
        if (partial.monthly !== undefined) body.monthly = partial.monthly;
        if (partial.monthlyDay !== undefined) body.monthlyDay = partial.monthlyDay;
        if (partial.monthlyAt !== undefined) body.monthlyAt = partial.monthlyAt;
        if (partial.saveTier !== undefined) body.saveTier = partial.saveTier;
        if (Object.keys(body).length > 0) {
          api.patchIteration(token, backendServerId, body).catch(() => {});
        }
      }
    },
    [serverId, token, backendServerId]
  );

  const lastRun = schedule.lastRun;
  const scheduleOptions = {
    dailyAt: schedule.dailyAt,
    weeklyOn: schedule.weeklyOn,
    intervalHours: schedule.intervalHours ?? INTERVAL_HOURS_DEFAULT,
    monthlyDay: schedule.monthlyDay,
    monthlyAt: schedule.monthlyAt,
  };
  const nextRun = {
    "3h": lastRun?.["3h"] ? getNextRunAt(lastRun["3h"], "3h", scheduleOptions) : null,
    daily: getNextRunAt(lastRun?.daily, "daily", scheduleOptions),
    weekly: getNextRunAt(lastRun?.weekly, "weekly", scheduleOptions),
    monthly: getNextRunAt(lastRun?.monthly, "monthly", scheduleOptions),
  };

  const createIteration = useCallback(
    async (type: IterationType): Promise<boolean> => {
      if (!token || !backendServerId || !getApiBaseUrl()) return false;
      setError(null);
      setRunning(true);
      const now = new Date();
      const name = formatIterationName(serverName, type, now);
      const saveTier = schedule.saveTier ?? "snapshot";
      try {
        await api.createArchive(token, backendServerId, { name, iterationType: type, saveTier });
        const at = now.toISOString();
        setLastRun(serverId, type, at);
        setScheduleState(getIterationSchedule(serverId));
        const body =
          type === "3h"
            ? { lastRun3h: at }
            : type === "daily"
              ? { lastRunDaily: at }
              : type === "weekly"
                ? { lastRunWeekly: at }
                : { lastRunMonthly: at };
        api.patchIteration(token, backendServerId, body).catch(() => {});
        onIterationCreated?.();
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        return false;
      } finally {
        setRunning(false);
      }
    },
    [token, backendServerId, serverId, serverName, schedule.saveTier, onIterationCreated]
  );

  const runNow = useCallback(
    async (type: IterationType): Promise<boolean> => {
      return createIteration(type);
    },
    [createIteration]
  );

  // Check and run due iterations (3h, daily, weekly, monthly)
  useEffect(() => {
    if (!token || !backendServerId || !getApiBaseUrl()) return;

    const runDue = async () => {
      const s = getIterationSchedule(serverId);
      const options = {
        dailyAt: s.dailyAt,
        weeklyOn: s.weeklyOn,
        intervalHours: s.intervalHours ?? INTERVAL_HOURS_DEFAULT,
        monthlyDay: s.monthlyDay,
        monthlyAt: s.monthlyAt,
      };
      const types: IterationType[] = ["3h", "daily", "weekly", "monthly"];
      const lastRunKey = (t: IterationType) => (t === "3h" ? "3h" : t);
      for (const type of types) {
        const enabled =
          (type === "3h" && s.every3h) ||
          (type === "daily" && s.daily) ||
          (type === "weekly" && s.weekly) ||
          (type === "monthly" && s.monthly);
        if (!enabled) continue;
        if (!isDue(s.lastRun?.[lastRunKey(type)], type, options)) continue;
        await createIteration(type);
        break; // one at a time per check
      }
    };

    const tick = () => {
      const now = Date.now();
      if (now - lastCheckRef.current < CHECK_INTERVAL_MS) return;
      lastCheckRef.current = now;
      runDue();
    };

    tick();
    const id = setInterval(tick, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [token, backendServerId, serverId, createIteration]);

  return {
    schedule,
    setSchedule,
    lastRun,
    nextRun,
    runNow,
    running,
    error,
  };
}
