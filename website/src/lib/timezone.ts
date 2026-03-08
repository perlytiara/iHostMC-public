/**
 * Timezone utilities: list IANA timezones and format dates in a chosen timezone.
 * Sync/backup metadata dates are shown in the user's chosen timezone.
 */

const STORAGE_KEY = "ihostmc-dashboard-timezone";

/** Get sorted IANA timezone IDs. Uses Intl.supportedValuesOf when available, else fallback list. */
export function getTimeZones(): string[] {
  if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
    try {
      const intlWithTz = Intl as unknown as { supportedValuesOf(key: "timeZone"): string[] };
      return intlWithTz.supportedValuesOf("timeZone");
    } catch {
      // ignore
    }
  }
  return FALLBACK_TIMEZONES.slice();
}

/** Common timezones for fallback when supportedValuesOf is not available. */
const FALLBACK_TIMEZONES = [
  "Africa/Cairo",
  "Africa/Johannesburg",
  "America/Chicago",
  "America/Los_Angeles",
  "America/New_York",
  "America/Denver",
  "America/Sao_Paulo",
  "America/Toronto",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Europe/Moscow",
  "Pacific/Auckland",
  "UTC",
];

/** Get user's stored timezone or browser default (Intl default). */
export function getStoredTimeZone(): string {
  if (typeof window === "undefined") return "UTC";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && typeof stored === "string" && stored.trim()) return stored.trim();
  } catch {
    // ignore
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** Persist chosen timezone. */
export function setStoredTimeZone(tz: string): void {
  try {
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, tz);
  } catch {
    // ignore
  }
}

/** Format a date (Date or ISO string) in the given timezone for display. */
export function formatInTimeZone(
  date: Date | string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" }
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return String(date);
  try {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/** Format date only (short) in timezone. */
export function formatDateInTimeZone(date: Date | string, timeZone: string): string {
  return formatInTimeZone(date, timeZone, { dateStyle: "short" });
}

/** Format date and time (short) in timezone. */
export function formatDateTimeInTimeZone(date: Date | string, timeZone: string): string {
  return formatInTimeZone(date, timeZone, { dateStyle: "short", timeStyle: "short" });
}
