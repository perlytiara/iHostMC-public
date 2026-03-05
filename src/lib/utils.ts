import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** True when the app is running inside the Tauri desktop window (not in a browser tab). */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as Window & { __TAURI__?: unknown }).__TAURI__;
}

/** Translation key returned when the app is not running in Tauri (browser instead of desktop). */
export const TAURI_DESKTOP_ERROR_KEY = "errors.runInDesktopMode";

/** User-friendly message when a Tauri API error (e.g. invoke undefined) occurs. Returns a translation key or the raw message. */
export function tauriErrorMessage(err: unknown): string {
  const msg = String(err);
  if (msg.includes("invoke") || msg.includes("undefined")) {
    return TAURI_DESKTOP_ERROR_KEY;
  }
  return msg;
}
