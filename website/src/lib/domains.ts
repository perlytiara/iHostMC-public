/**
 * Subdomains for different parts of the product. Use for labels and links
 * so users know where they are (app vs cloud vs marketing).
 */
export const DOMAINS = {
  /** Main marketing site (ihost.one or mc.ihost.one). */
  main: "ihost.one",
  /** Minecraft / product marketing. */
  mc: "mc.ihost.one",
  /** App dashboard: servers, profile, settings. */
  app: "app.ihost.one",
  /** Cloud: backups, storage, sync. */
  cloud: "cloud.ihost.one",
  /** Game / play (future). */
  play: "play.ihost.one",
} as const;

/** Resolve the current host at runtime (client). Falls back to app when building. */
export function getAppHost(): string {
  if (typeof window !== "undefined") return window.location.host;
  return DOMAINS.app;
}

export function getCloudHost(): string {
  if (typeof window !== "undefined") return window.location.host;
  return DOMAINS.cloud;
}
