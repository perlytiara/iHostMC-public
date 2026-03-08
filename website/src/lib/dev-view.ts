/** Client-side cookie set by the "Dev view" toggle. When "1", user sees full site (all nav, dashboard) even when NEXT_PUBLIC_SITE_UNDER_CONSTRUCTION is true. */
export const DEV_VIEW_COOKIE = "ihostmc-dev-view";

const COOKIE_MAX_AGE_DAYS = 7;

/** Set the dev-view cookie (client-side). Call from Header when user enables "Full site". */
export function setDevViewCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${DEV_VIEW_COOKIE}=1;path=/;max-age=${60 * 60 * 24 * COOKIE_MAX_AGE_DAYS};SameSite=Lax`;
}

/** Clear the dev-view cookie (client-side). */
export function clearDevViewCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${DEV_VIEW_COOKIE}=;path=/;max-age=0`;
}

/** Read dev-view cookie (client-side). Returns true if cookie is "1". */
export function hasDevViewCookie(): boolean {
  if (typeof document === "undefined") return false;
  const match = document.cookie.match(new RegExp(`(?:^|; )${DEV_VIEW_COOKIE}=([^;]*)`));
  return match?.[1] === "1";
}
