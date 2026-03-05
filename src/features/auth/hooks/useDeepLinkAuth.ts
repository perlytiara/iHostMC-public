import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAuthStore } from "../store/auth-store";
import { api, claimAppSession } from "@/lib/api-client";
import { toast } from "@/lib/toast-store";

const AUTH_SCHEME = "ihostmc";
const AUTH_PATH = "auth";
const SESSION_POLL_INTERVAL_MS = 1500;
const SESSION_POLL_TIMEOUT_MS = 60 * 1000;

export interface AuthPayload {
  token: string;
  userId: string;
  email: string;
  exp?: number;
}

function parseAuthUrl(url: string): AuthPayload | null {
  try {
    if (!url.startsWith(`${AUTH_SCHEME}:`) || !url.includes(AUTH_PATH)) return null;
    const u = new URL(url);
    const payloadB64 = u.searchParams.get("payload");
    if (!payloadB64) return null;
    const rawB64 = decodeURIComponent(payloadB64);
    const json = decodeURIComponent(escape(atob(rawB64.replace(/-/g, "+").replace(/_/g, "/"))));
    const data = JSON.parse(json) as AuthPayload & { exp?: number };
    if (!data.token || !data.userId || !data.email) return null;
    if (typeof data.exp === "number" && Date.now() > data.exp) return null; // expired
    return { token: data.token, userId: data.userId, email: data.email };
  } catch {
    return null;
  }
}

/** Parse ihostmc://auth?session=XXX (website-initiated; app polls backend to claim token). */
function parseAuthSessionUrl(url: string): string | null {
  try {
    if (!url.startsWith(`${AUTH_SCHEME}:`) || !url.includes(AUTH_PATH)) return null;
    const u = new URL(url);
    const sessionId = u.searchParams.get("session")?.trim();
    return sessionId ?? null;
  } catch {
    return null;
  }
}

async function pollSessionAndSignIn(sessionId: string): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < SESSION_POLL_TIMEOUT_MS) {
    const auth = await claimAppSession(sessionId);
    if (auth && (await applyPayload(auth))) return true;
    await new Promise((r) => setTimeout(r, SESSION_POLL_INTERVAL_MS));
  }
  return false;
}

export async function applyPayload(payload: AuthPayload): Promise<boolean> {
  try {
    const me = await api.me(payload.token);
    useAuthStore.getState().setUser({
      token: payload.token,
      userId: me.userId,
      email: me.email,
    });
    return true;
  } catch {
    return false;
  }
}

function showSignedInToast(email: string): void {
  toast.success(`Signed in as ${email}`);
}

/**
 * Listens for ihostmc://auth?payload=<base64> deep links and for dev server "deep-link-auth" event.
 * Signs the user in and shows a toast. Run only when isTauri() is true.
 */
export function useDeepLinkAuth(): void {
  useEffect(() => {
    if (typeof window === "undefined" || !(window as Window & { __TAURI__?: unknown }).__TAURI__) return;

    let unsubOpenUrl: (() => void) | undefined;
    let unsubDevAuth: (() => void) | undefined;

    (async () => {
      // Register first so we don't miss an early POST from the website
      const unsub = await listen<AuthPayload>("deep-link-auth", async (e) => {
        const p = e.payload;
        if (p?.token && p?.userId && p?.email) {
          try {
            if (await applyPayload(p)) {
              showSignedInToast(p.email);
              try {
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                const win = getCurrentWindow();
                win.show();
                win.setFocus();
              } catch {
                // ignore
              }
            }
          } catch {
            // ignore
          }
        }
      });
      unsubDevAuth = () => {
        unsub();
      };

      const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
      const urls = await getCurrent();
      for (const url of urls ?? []) {
        const payload = parseAuthUrl(url);
        if (payload) {
          if (await applyPayload(payload)) showSignedInToast(payload.email);
          break;
        }
        const sessionId = parseAuthSessionUrl(url);
        if (sessionId && (await pollSessionAndSignIn(sessionId))) {
          const u = useAuthStore.getState().user;
          if (u?.email) showSignedInToast(u.email);
          break;
        }
      }

      unsubOpenUrl = await onOpenUrl((urls) => {
        for (const url of urls) {
          const payload = parseAuthUrl(url);
          if (payload) {
            applyPayload(payload).then((ok) => ok && showSignedInToast(payload.email));
            break;
          }
          const sessionId = parseAuthSessionUrl(url);
          if (sessionId) {
            pollSessionAndSignIn(sessionId).then((ok) => {
              if (ok) {
                const u = useAuthStore.getState().user;
                if (u?.email) showSignedInToast(u.email);
                import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
                  getCurrentWindow().show();
                  getCurrentWindow().setFocus();
                }).catch(() => {});
              }
            });
            break;
          }
        }
      });
    })();

    return () => {
      unsubOpenUrl?.();
      unsubDevAuth?.();
    };
  }, []);
}
