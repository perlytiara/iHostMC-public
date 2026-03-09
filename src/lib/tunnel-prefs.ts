/**
 * Relay (FRP) config for "Share server". Single relay: play.ihost.one.
 * Token: (1) user's in Settings, (2) build-time env (dev only), (3) fetched from backend when logged in (no key in distributed build).
 */

import { RELAY_PUBLIC_TOKEN } from "./relay-token.generated";
import { api, isBackendConfigured } from "./api-client";

const KEY_FRP_API_BASE = "ihostmc_frp_api_base_url";
const KEY_FRP_SERVER_ADDR = "ihostmc_frp_server_addr";
const KEY_FRP_SERVER_PORT = "ihostmc_frp_server_port";
const KEY_FRP_TOKEN = "ihostmc_frp_token";

/** Default token: env/secret first (build-time), then generated file (local dev). */
export function getDefaultRelayToken(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_RELAY_PUBLIC_TOKEN) {
    return (import.meta.env.VITE_RELAY_PUBLIC_TOKEN as string).trim();
  }
  return RELAY_PUBLIC_TOKEN;
}

const _defaultServer = {
  apiBaseUrl: "https://play.ihost.one",
  serverAddr: "play.ihost.one",
  serverPort: 7000,
  token: "", // use getDefaultFrpServer() or getDefaultRelayToken() for actual value
} as const;

/** Public relay – one server for all iHostMC users. Use getDefaultFrpServer() for config with token. */
export const DEFAULT_FRP_SERVER = _defaultServer;

/** Default relay config with token filled from env/secret or generated file. */
export function getDefaultFrpServer(): FrpPrefs {
  return {
    ..._defaultServer,
    token: getDefaultRelayToken(),
  };
}

export interface FrpPrefs {
  apiBaseUrl: string;
  serverAddr: string;
  serverPort: number;
  token: string;
}

/** Migrate stale DuckDNS relay URLs to play.ihost.one (one-time). */
function migrateLegacyPrefs(): void {
  if (typeof localStorage === "undefined") return;
  const apiBase = localStorage.getItem(KEY_FRP_API_BASE) ?? "";
  const serverAddr = localStorage.getItem(KEY_FRP_SERVER_ADDR) ?? "";
  if (apiBase.includes("ihostmc.duckdns.org") || apiBase.includes("ihostmc-api.duckdns.org")) {
    localStorage.setItem(KEY_FRP_API_BASE, _defaultServer.apiBaseUrl);
  }
  if (serverAddr.includes("ihostmc.duckdns.org") || serverAddr.includes("ihostmc-api.duckdns.org")) {
    localStorage.setItem(KEY_FRP_SERVER_ADDR, _defaultServer.serverAddr);
  }
}

let _migrated = false;

export function getFrpPrefs(): FrpPrefs {
  if (typeof localStorage === "undefined") {
    return getDefaultFrpServer();
  }
  if (!_migrated) { _migrated = true; migrateLegacyPrefs(); }
  const defaultServer = getDefaultFrpServer();
  const apiBase = localStorage.getItem(KEY_FRP_API_BASE);
  const serverAddr = localStorage.getItem(KEY_FRP_SERVER_ADDR);
  const portRaw = localStorage.getItem(KEY_FRP_SERVER_PORT);
  const port = portRaw ? parseInt(portRaw, 10) : defaultServer.serverPort;
  const storedToken = localStorage.getItem(KEY_FRP_TOKEN);
  const isDefaultServer =
    (apiBase === null || apiBase === "" || apiBase === defaultServer.apiBaseUrl) &&
    (serverAddr === null || serverAddr === "" || serverAddr === defaultServer.serverAddr);
  return {
    apiBaseUrl: apiBase !== null && apiBase !== "" ? apiBase : defaultServer.apiBaseUrl,
    serverAddr: serverAddr !== null && serverAddr !== "" ? serverAddr : defaultServer.serverAddr,
    serverPort: Number.isFinite(port) && port > 0 ? port : defaultServer.serverPort,
    token: storedToken !== null && storedToken !== "" ? storedToken : (isDefaultServer ? getDefaultRelayToken() : ""),
  };
}

export function setFrpPrefs(prefs: FrpPrefs): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY_FRP_API_BASE, prefs.apiBaseUrl);
  localStorage.setItem(KEY_FRP_SERVER_ADDR, prefs.serverAddr);
  localStorage.setItem(KEY_FRP_SERVER_PORT, String(prefs.serverPort));
  localStorage.setItem(KEY_FRP_TOKEN, prefs.token);
}

let cachedRelayTokenFromBackend: string | null = null;

/**
 * Resolve the relay token for Share: token from backend when logged in (synced on login), or build-time default.
 * No manual entry in Settings; client receives it through login.
 */
export async function getRelayTokenForTunnel(authToken: string | null): Promise<string> {
  const frp = getFrpPrefs();
  if (!authToken || !isBackendConfigured()) return frp.token || getDefaultRelayToken();
  if (cachedRelayTokenFromBackend) return cachedRelayTokenFromBackend;
  if (frp.token) return frp.token;
  try {
    const r = await api.getRelayToken(authToken);
    if (r.token) cachedRelayTokenFromBackend = r.token;
    return r.token ?? getDefaultRelayToken();
  } catch {
    return getDefaultRelayToken();
  }
}
