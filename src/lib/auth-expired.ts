/**
 * Centralized handling for 401 Unauthorized. When the backend returns 401 (expired/invalid token),
 * we dispatch an event so the app can clear auth and show the connect screen.
 * Call checkResponseAuth(res) after any fetch that uses Bearer token.
 */
const AUTH_EXPIRED_EVENT = "ihostmc-auth-expired";

export function checkResponseAuth(res: Response): void {
  if (res.status === 401) {
    try {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    } catch {
      // ignore if window not available (SSR)
    }
  }
}

export function onAuthExpired(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(AUTH_EXPIRED_EVENT, handler);
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
}
