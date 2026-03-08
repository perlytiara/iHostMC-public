import { routing } from "./routing";
import { isValidProductSlug } from "@/lib/products";

export type Locale = (typeof routing.locales)[number];

/** Logical route keys – use these in Link href and programmatic nav */
export type PathnameKey =
  | "home"
  | "about"
  | "products"
  | "docs"
  | "contribute"
  | "pricing"
  | "credits"
  | "login"
  | "loginCallback"
  | "signup"
  | "forgotPassword"
  | "resetPassword"
  | "verifyEmail"
  | "verifyEmailWait"
  | "confirmAccount"
  | "dashboard"
  | "dashboardAccount"
  | "dashboardSettings"
  | "dashboardBackups"
  | "dashboardServers"
  | "dashboardCloudServer"
  | "dashboardBackupDetail"
  | "dashboardVersions"
  | "dashboardAdmin"
  | "checkoutReturn"
  | "privacy"
  | "cookiePolicy"
  | "terms";

/** Per-locale path segments (no leading/trailing slashes). Empty string = root. */
export const pathnames: Record<PathnameKey, Record<Locale, string>> = {
  home: { en: "", de: "", fr: "" },
  about: { en: "about", de: "ueber-uns", fr: "a-propos" },
  products: { en: "products", de: "produkte", fr: "produits" },
  docs: { en: "docs", de: "dokumentation", fr: "documentation" },
  contribute: { en: "contribute", de: "mitwirken", fr: "contribuer" },
  pricing: { en: "pricing", de: "preise", fr: "tarifs" },
  credits: { en: "credits", de: "credits", fr: "credits" },
  login: { en: "login", de: "anmelden", fr: "connexion" },
  loginCallback: { en: "login/callback", de: "login/callback", fr: "login/callback" },
  signup: { en: "signup", de: "registrieren", fr: "inscription" },
  forgotPassword: { en: "forgot-password", de: "passwort-vergessen", fr: "mot-de-passe-oublie" },
  resetPassword: { en: "reset-password", de: "passwort-zuruecksetzen", fr: "reinitialiser-mot-de-passe" },
  verifyEmail: { en: "verify-email", de: "email-bestaetigen", fr: "verifier-email" },
  verifyEmailWait: { en: "verify-email-wait", de: "email-bestaetigen-warten", fr: "verifier-email-attente" },
  confirmAccount: { en: "confirm-account", de: "konto-bestaetigen", fr: "confirmer-compte" },
  dashboard: { en: "dashboard", de: "uebersicht", fr: "tableau-de-bord" },
  dashboardAccount: { en: "dashboard/account", de: "uebersicht/konto", fr: "tableau-de-bord/compte" },
  dashboardSettings: { en: "dashboard/settings", de: "uebersicht/einstellungen", fr: "tableau-de-bord/parametres" },
  dashboardBackups: { en: "dashboard/backups", de: "uebersicht/sicherungen", fr: "tableau-de-bord/sauvegardes" },
  dashboardServers: { en: "dashboard/servers", de: "uebersicht/server", fr: "tableau-de-bord/serveurs" },
  dashboardCloudServer: { en: "dashboard/backups/server", de: "uebersicht/sicherungen/server", fr: "tableau-de-bord/sauvegardes/server" },
  dashboardBackupDetail: { en: "dashboard/backups/snapshot", de: "uebersicht/sicherungen/snapshot", fr: "tableau-de-bord/sauvegardes/snapshot" },
  dashboardVersions: { en: "dashboard/versions", de: "uebersicht/versionen", fr: "tableau-de-bord/versions" },
  dashboardAdmin: { en: "dashboard/admin", de: "uebersicht/admin", fr: "tableau-de-bord/admin" },
  checkoutReturn: { en: "checkout/return", de: "kasse/zurueck", fr: "paiement/retour" },
  privacy: { en: "privacy", de: "datenschutz", fr: "confidentialite" },
  cookiePolicy: { en: "cookies", de: "cookies", fr: "cookies" },
  terms: { en: "terms", de: "agb", fr: "conditions" },
};

/** Path segments (no leading slash) to pathname key for a given locale */
export function getPathnameKey(pathSegments: string[], locale: Locale): PathnameKey | null {
  const path = pathSegments.join("/").toLowerCase();
  for (const key of Object.keys(pathnames) as PathnameKey[]) {
    if (pathnames[key][locale] === path) return key;
  }
  // Backup/snapshot detail: dashboard/backups/snapshot/:backupId
  if (pathSegments.length === 4) {
    const snapshotBase = pathnames.dashboardBackupDetail[locale];
    const snapshotSegs = snapshotBase.split("/");
    if (
      snapshotSegs.length === 3 &&
      pathSegments[0] === snapshotSegs[0] &&
      pathSegments[1] === snapshotSegs[1] &&
      pathSegments[2] === snapshotSegs[2]
    ) {
      return "dashboardBackupDetail";
    }
    // Cloud server detail: dashboard/backups/server/:serverId
    const cloudServerBase = pathnames.dashboardCloudServer[locale];
    const baseSegs = cloudServerBase.split("/");
    if (
      baseSegs.length === 3 &&
      pathSegments[0] === baseSegs[0] &&
      pathSegments[1] === baseSegs[1] &&
      pathSegments[2] === baseSegs[2]
    ) {
      return "dashboardCloudServer";
    }
    const baseServers = pathnames.dashboardServers[locale].split("/");
    const baseBackups = pathnames.dashboardBackups[locale].split("/");
    if (
      pathSegments[0] === baseServers[0] &&
      pathSegments[1] === baseServers[1] &&
      isValidProductSlug(pathSegments[2])
    ) {
      return "dashboardServers";
    }
    if (
      pathSegments[0] === baseBackups[0] &&
      pathSegments[1] === baseBackups[1] &&
      isValidProductSlug(pathSegments[2])
    ) {
      return "dashboardBackups";
    }
  }
  return null;
}

/** Full path (with leading slash) for a pathname key and locale */
export function getPath(pathnameKey: PathnameKey, locale: Locale): string {
  const seg = pathnames[pathnameKey][locale];
  return seg ? `/${seg}` : "/";
}

/** Path for dashboard server detail: /dashboard/servers/:game/:serverId (locale-aware) */
export function getDashboardServerDetailPath(gameSlug: string, serverId: string, locale: Locale): string {
  const base = pathnames.dashboardServers[locale];
  return `/${base}/${gameSlug}/${serverId}`;
}

/** Path for dashboard backup detail: /dashboard/backups/:game/:backupId (locale-aware) */
export function getDashboardBackupDetailPath(gameSlug: string, backupId: string, locale: Locale): string {
  const base = pathnames.dashboardBackups[locale];
  return `/${base}/${gameSlug}/${backupId}`;
}

/** Path for cloud server detail: /dashboard/backups/server/:serverId (locale-aware) */
export function getCloudServerDetailPath(serverId: string, locale: Locale): string {
  const base = pathnames.dashboardCloudServer[locale];
  return `/${base}/${serverId}`;
}

/** Path for backup/snapshot detail: /dashboard/backups/snapshot/:backupId (locale-aware) */
export function getBackupDetailPath(backupId: string, locale: Locale): string {
  const base = pathnames.dashboardBackupDetail[locale];
  return `/${base}/${backupId}`;
}

/** Path segments from pathname (e.g. "dashboard/backups" -> ["dashboard", "backups"]) */
export function pathToSegments(path: string): string[] {
  return path.replace(/^\/|\/$/g, "").split("/").filter(Boolean);
}

/** Canonical (English) path without leading slash to pathname key */
export function getPathnameKeyFromCanonicalPath(canonicalPath: string): PathnameKey | null {
  const path = canonicalPath.replace(/^\/|\/$/g, "");
  for (const key of Object.keys(pathnames) as PathnameKey[]) {
    if (pathnames[key].en === path) return key;
  }
  return null;
}
