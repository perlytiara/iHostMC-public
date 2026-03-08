"use client";

import React, { useId, useEffect, useState } from "react";
import { useRouter, usePathname, Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { getStoredToken, getApiBaseUrl } from "@/lib/api";
import {
  validateSession,
  sanitizeAndRedirectToLogin,
  performFullLogout,
  REVALIDATE_INTERVAL,
} from "@/lib/auth-session";
import { getPath, type Locale } from "@/i18n/pathnames";
import { routing } from "@/i18n/routing";
import {
  LayoutDashboard,
  UserCircle,
  Settings,
  FolderArchive,
  Menu,
  X,
  ChevronDown,
  Tag,
  Shield,
  LogOut,
} from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { SafeIcon } from "@/components/SafeIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavKey = "dashboard" | "dashboardBackups" | "dashboardAccount" | "dashboardSettings" | "dashboardVersions" | "dashboardAdmin";

const NAV_BASE: { key: NavKey; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { key: "dashboardBackups", label: "Cloud", Icon: FolderArchive },
  { key: "dashboardVersions", label: "Versions", Icon: Tag },
  { key: "dashboardAccount", label: "Profile", Icon: UserCircle },
  { key: "dashboardSettings", label: "Settings", Icon: Settings },
];

const NAV_ADMIN: { key: NavKey; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  ...NAV_BASE,
  { key: "dashboardAdmin", label: "Admin", Icon: Shield },
];

function NavLinks({
  locale,
  navItems,
  isActive,
  onNavigate,
}: {
  locale: Locale;
  navItems: { key: NavKey; label: string; Icon: React.ComponentType<{ className?: string }> }[];
  isActive: (k: NavKey) => boolean;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-0.5" role="tablist">
      {navItems.map(({ key, label, Icon }) => {
        const active = isActive(key);
        return (
          <li key={key}>
            <Link
              href={getPath(key, locale)}
              role="tab"
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors border-l-2 ${
                active
                  ? "border-primary/60 bg-muted/40 text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <SafeIcon><Icon className="h-4 w-4 shrink-0" aria-hidden /></SafeIcon>
              <span className="flex-1">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}


export default function DashboardLayout(props: { children: React.ReactNode }) {
  const t = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale() as Locale;
  const menuTriggerId = useId();
  const [showSignedInBanner, setShowSignedInBanner] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [appHost, setAppHost] = useState("app.ihost.one");
  const [isAdmin, setIsAdmin] = useState(false);
  const [tokenValidated, setTokenValidated] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setAppHost(window.location.host);
  }, []);

  const loginPath = getPath("login", locale);

  // Validate token on mount; if stale/invalid, sanitize and redirect to login with reason
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setTokenValidated(true);
      return;
    }
    validateSession().then((result) => {
      if (!result.valid) {
        sanitizeAndRedirectToLogin(loginPath, "session_expired");
        return;
      }
      if (result.valid && "isAdmin" in result) setIsAdmin(result.isAdmin);
      setTokenValidated(true);
    });
  }, [loginPath]);

  useEffect(() => {
    if (!tokenValidated) return;
    if (!getStoredToken()) {
      router.replace(loginPath);
    }
  }, [pathname, router, locale, tokenValidated, loginPath]);

  useEffect(() => {
    if (searchParams.get("signed_in") === "app") {
      setShowSignedInBanner(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("signed_in");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, [searchParams]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // On focus: re-validate and keep cookies in sync; if 401, sanitize and redirect with "session expired"
  useEffect(() => {
    const onFocus = () => {
      if (!getStoredToken()) return;
      validateSession().then((result) => {
        if (!result.valid) sanitizeAndRedirectToLogin(loginPath, "session_expired");
        else if (result.valid && "isAdmin" in result) setIsAdmin(result.isAdmin);
      });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loginPath]);

  // Periodic re-validation so long-lived tabs don't stay "logged in" with an expired token
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      if (!getStoredToken()) return;
      validateSession().then((result) => {
        if (!result.valid) sanitizeAndRedirectToLogin(loginPath, "session_expired");
      });
    }, REVALIDATE_INTERVAL);
    return () => clearInterval(id);
  }, [loginPath]);

  const navItems = isAdmin ? NAV_ADMIN : NAV_BASE;

  const isActive = (key: NavKey) => {
    const path = getPath(key, locale).replace(/^\//, "");
    let current = pathname?.replace(/^\//, "") ?? "";
    const segments = current.split("/").filter(Boolean);
    if (segments.length > 0 && routing.locales.includes(segments[0] as Locale)) {
      current = segments.slice(1).join("/");
    }
    if (key === "dashboard") {
      return current === path;
    }
    if (key === "dashboardBackups") {
      const backupsPath = path;
      const serversPath = getPath("dashboardServers", locale).replace(/^\//, "");
      return current === backupsPath || current.startsWith(backupsPath + "/") || current === serversPath || current.startsWith(serversPath + "/");
    }
    return current === path || current.startsWith(path + "/");
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background" suppressHydrationWarning>
      {/* App top bar: brand + hamburger (mobile) + Menu dropdown (Dashboard, Cloud, Versions, Profile, Settings). */}
      <header
        className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-card/50 px-4 md:px-6"
        style={{ background: "hsl(var(--titlebar-bg))", borderColor: "hsl(var(--titlebar-border))" }}
        suppressHydrationWarning
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="md:hidden p-2 -ml-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <SafeIcon><X className="h-5 w-5" /></SafeIcon> : <SafeIcon><Menu className="h-5 w-5" /></SafeIcon>}
          </button>
          <Link
            href={getPath("dashboard", locale)}
            className="flex items-center gap-2 font-semibold text-foreground hover:opacity-90"
          >
            <AppLogo size={24} />
            <span>iHost</span>
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
          <DropdownMenuTrigger asChild id={menuTriggerId}>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Open menu"
            >
              <SafeIcon><Menu className="h-5 w-5" aria-hidden /></SafeIcon>
              <span className="hidden sm:inline">Menu</span>
              <SafeIcon><ChevronDown className="h-4 w-4" aria-hidden /></SafeIcon>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {navItems.map(({ key, label, Icon }) => (
              <DropdownMenuItem key={key} asChild>
                <Link href={getPath(key, locale)} className="flex items-center gap-2">
                  <SafeIcon><Icon className="h-4 w-4" aria-hidden /></SafeIcon>
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
            <div className="my-1 border-t border-border" />
            <DropdownMenuItem
              onSelect={() => {
                setMobileMenuOpen(false);
                performFullLogout();
              }}
              className="flex cursor-pointer items-center gap-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <SafeIcon><LogOut className="h-4 w-4" aria-hidden /></SafeIcon>
              {t("signOut")}
            </DropdownMenuItem>
            <div className="my-1 border-t border-border" />
            <div className="px-2 py-1.5 text-xs text-muted-foreground" aria-hidden>
              {appHost}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Desktop sidebar — in flow with navbar so it stays attached when content scrolls */}
      <aside
        className="hidden md:flex md:w-56 lg:w-60 md:flex-shrink-0 md:flex-col z-30 border-r border-border bg-card/50"
        aria-label="Dashboard navigation"
      >
        <nav className="flex-1 overflow-y-auto p-3 pt-4 flex flex-col">
          <NavLinks locale={locale} navItems={navItems} isActive={isActive} />
          <div className="mt-auto border-t border-border pt-3">
            <button
              type="button"
              onClick={() => performFullLogout()}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <SafeIcon><LogOut className="h-4 w-4 shrink-0" aria-hidden /></SafeIcon>
              {t("signOut")}
            </button>
          </div>
        </nav>
      </aside>

      {mobileMenuOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/50"
            aria-hidden
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside
            className="md:hidden fixed top-14 left-0 bottom-0 z-50 w-64 max-w-[85vw] bg-card border-r border-border shadow-xl overflow-y-auto"
            aria-label="Dashboard navigation"
          >
            <div className="p-4 border-b border-border">
              <Link
                href={getPath("dashboard", locale)}
                className="flex items-center gap-2 font-semibold text-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                <SafeIcon><LayoutDashboard className="h-5 w-5 text-primary" aria-hidden /></SafeIcon>
                Dashboard
              </Link>
            </div>
            <nav className="p-3 flex flex-col">
              <NavLinks
                locale={locale}
                navItems={navItems}
                isActive={isActive}
                onNavigate={() => setMobileMenuOpen(false)}
              />
              <div className="mt-auto border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    performFullLogout();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <SafeIcon><LogOut className="h-4 w-4 shrink-0" aria-hidden /></SafeIcon>
                  {t("signOut")}
                </button>
              </div>
            </nav>
          </aside>
        </>
      )}

      {/* Main content — only this area scrolls; content goes under navbar/sidebar visually in same column */}
      <main className="flex-1 min-h-0 flex flex-col overflow-y-auto pt-4 md:pt-0">
        <div className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 md:py-8">
          {showSignedInBanner && (
            <div className="rounded-lg border border-emerald-800 bg-emerald-900/30 px-4 py-3 text-sm text-emerald-200 mb-4 flex items-center justify-between gap-4">
              <span>Success! You&apos;re logged in. The app has been signed in.</span>
              <button
                type="button"
                onClick={() => setShowSignedInBanner(false)}
                className="text-emerald-300 hover:text-white shrink-0 p-1"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}
          {props.children}
        </div>
      </main>
      </div>
    </div>
  );
}
