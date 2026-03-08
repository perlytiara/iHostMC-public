"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter, usePathnameKey, getLocalizedPath } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { getStoredToken, clearStoredAuth } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import { AppLogo } from "@/components/AppLogo";
import { SafeIcon } from "@/components/SafeIcon";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hasDevViewCookie, setDevViewCookie, clearDevViewCookie } from "@/lib/dev-view";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  LogOut,
  Menu,
  X,
  Home,
  Package,
  BookOpen,
  Heart,
  CreditCard,
  LayoutDashboard,
  Users,
  Construction,
  Code2,
} from "lucide-react";

const LOCALE_FLAGS: Record<string, string> = { en: "🇺🇸", de: "🇩🇪", fr: "🇫🇷" };
const LOCALE_NAMES: Record<string, string> = { en: "English", de: "Deutsch", fr: "Français" };
const COOKIE_NAME = "NEXT_LOCALE";
const UNDER_CONSTRUCTION = process.env.NEXT_PUBLIC_SITE_UNDER_CONSTRUCTION !== "false";

function setLocaleCookie(locale: string) {
  if (typeof document !== "undefined") {
    document.cookie = `${COOKIE_NAME}=${locale};path=/;max-age=${60 * 60 * 24 * 365}`;
  }
}

const dropdownContentClass =
  "z-50 min-w-[200px] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg";
const itemClass =
  "relative flex min-h-[44px] cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

const FULL_NAV_LINKS = [
  { href: "/", key: "home", Icon: Home },
  { href: "/products", key: "products", Icon: Package },
  { href: "/docs", key: "docs", Icon: BookOpen },
  { href: "/contribute", key: "contribute", Icon: Heart },
  { href: "/pricing", key: "pricing", Icon: CreditCard },
] as const;

/** Simplified nav when site is under construction: fewer links, focus on about + pricing. */
const SIMPLE_NAV_LINKS = [
  { href: "/", key: "home", Icon: Home },
  { href: "/about", key: "about", Icon: Users },
  { href: "/pricing", key: "pricing", Icon: CreditCard },
] as const;

export function Header() {
  const t = useTranslations("nav");
  const tMenu = useTranslations("menu");
  const pathname = usePathname();
  const pathnameKey = usePathnameKey();
  const locale = useLocale();
  const router = useRouter();
  const { theme, setTheme, resolvedDark } = useTheme();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [devViewOn, setDevViewOn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsLoggedIn(!!getStoredToken());
  }, [pathname]);

  useEffect(() => {
    setDevViewOn(hasDevViewCookie());
  }, []);

  useEffect(() => {
    if (!UNDER_CONSTRUCTION) return;
    fetch("/api/admin-preview", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setIsAdmin(data?.admin === true))
      .catch(() => setIsAdmin(false));
  }, []);

  const navLinks = UNDER_CONSTRUCTION ? (devViewOn ? FULL_NAV_LINKS : SIMPLE_NAV_LINKS) : FULL_NAV_LINKS;

  const handleDevViewToggle = (enableFullSite: boolean) => {
    if (enableFullSite) {
      setDevViewCookie();
    } else {
      clearDevViewCookie();
    }
    window.location.reload();
  };

  const isDashboard =
    pathname?.includes("dashboard") ||
    pathname?.includes("uebersicht") ||
    pathname?.includes("tableau-de-bord");

  const isActive = (href: string) => {
    if (href === "/") return !pathname || pathname === "/";
    return pathname?.startsWith(href);
  };

  const logout = () => {
    setMenuOpen(false);
    setMobileNavOpen(false);
    // Clear admin-preview cookie so logged-out users don't keep full-site access or see view toggle
    fetch("/api/admin-preview", { method: "DELETE", credentials: "include" }).catch(() => {});
    clearStoredAuth();
    setIsLoggedIn(false);
    // Full reload so all client state (e.g. cached auth) is cleared and logout is reliable
    window.location.assign("/");
  };

  const closeMenus = () => {
    setMenuOpen(false);
    setMobileNavOpen(false);
  };

  return (
    <header className="header-bar sticky top-0 z-40 flex h-14 min-h-[3.5rem] flex-shrink-0 items-center border-b px-4 md:px-6">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        {/* Logo + under-construction badge + dev view toggle */}
        <div className="flex min-h-[44px] shrink-0 items-center gap-3">
          <Link
            href={isDashboard ? "/dashboard" : "/"}
            className="flex items-center gap-2 rounded-lg py-2 pr-2 text-foreground no-underline hover:opacity-90 focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <AppLogo size={28} />
            <span className="text-base font-bold tracking-tight">{BRAND.appName}</span>
          </Link>
          {UNDER_CONSTRUCTION && !devViewOn && (
            <span
              className="hidden rounded-full border border-primary/25 bg-primary/8 px-2 py-0.5 text-[11px] font-medium text-primary/90 dark:text-primary sm:inline-block"
              title={t("underConstructionTitle")}
            >
              {t("underConstruction")}
            </span>
          )}
        </div>

        {/* Desktop nav: simple text links with underline active state */}
        <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
          {navLinks.map(({ href, key, Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-foreground",
                isActive(href)
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              )}
            >
              {isActive(href) && (
                <span
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary"
                  aria-hidden
                />
              )}
              <SafeIcon><Icon className="h-4 w-4 shrink-0" aria-hidden /></SafeIcon>
              <span className="relative">{t(key)}</span>
            </Link>
          ))}
        </nav>

        {/* Right: Sign in + Sign up. Use button + window.location so navigation always works (avoids Radix/SPA blocking). */}
        <div className="flex shrink-0 items-center gap-2">
          {!isLoggedIn && (
            <>
              <button
                type="button"
                onClick={() => { window.location.href = "/login"; }}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50"
              >
                {t("signIn")}
              </button>
              <Button
                size="sm"
                className="rounded-lg font-medium"
                variant="default"
                onClick={() => { window.location.href = "/signup"; }}
              >
                {t("signUp")}
              </Button>
            </>
          )}

          {/* Desktop: account/settings dropdown */}
          <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={t("menu")}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <SafeIcon><ChevronDown className="h-4 w-4" aria-hidden /></SafeIcon>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className={dropdownContentClass}
                align="end"
                sideOffset={6}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className={itemClass}>
                    {resolvedDark ? <SafeIcon><Moon className="h-3.5 w-3.5" /></SafeIcon> : <SafeIcon><Sun className="h-3.5 w-3.5" /></SafeIcon>}
                    {tMenu("theme")}
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent className={dropdownContentClass} sideOffset={4}>
                      <DropdownMenu.Item className={itemClass} onSelect={() => setTheme("system")}>
                        <SafeIcon><Monitor className="h-3.5 w-3.5" /></SafeIcon>
                        {tMenu("system")}
                        {theme === "system" && " ✓"}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className={itemClass} onSelect={() => setTheme("light")}>
                        <SafeIcon><Sun className="h-3.5 w-3.5" /></SafeIcon>
                        {tMenu("light")}
                        {theme === "light" && " ✓"}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className={itemClass} onSelect={() => setTheme("dark")}>
                        <SafeIcon><Moon className="h-3.5 w-3.5" /></SafeIcon>
                        {tMenu("dark")}
                        {theme === "dark" && " ✓"}
                      </DropdownMenu.Item>
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className={itemClass}>
                    <span className="text-base leading-none">{LOCALE_FLAGS[locale] ?? "🌐"}</span>
                    {tMenu("language")}
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent className={dropdownContentClass} sideOffset={4}>
                      {routing.locales.map((loc) => (
                        <DropdownMenu.Item
                          key={loc}
                          className={itemClass}
                          onSelect={() => {
                            setLocaleCookie(loc);
                            const path = pathnameKey ? getLocalizedPath(pathnameKey, loc) : "/";
                            router.push(path, { scroll: false });
                            closeMenus();
                          }}
                        >
                          <span className="text-base">{LOCALE_FLAGS[loc]}</span>
                          {LOCALE_NAMES[loc]}
                          {locale === loc && " ✓"}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
                {UNDER_CONSTRUCTION && isAdmin && isLoggedIn && (
                  <>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                    <div className="px-3 py-2 text-xs font-medium text-muted-foreground" role="group" aria-label={t("viewModeLabel")}>
                      {t("viewModeLabel")}
                    </div>
                    <DropdownMenu.Item
                      className={itemClass}
                      onSelect={() => { handleDevViewToggle(false); closeMenus(); }}
                    >
                      <SafeIcon><Construction className="h-3.5 w-3.5 shrink-0" aria-hidden /></SafeIcon>
                      {t("underDevView")}
                      {!devViewOn && " ✓"}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={itemClass}
                      onSelect={() => { handleDevViewToggle(true); closeMenus(); }}
                    >
                      <SafeIcon><Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden /></SafeIcon>
                      {t("fullSiteView")}
                      {devViewOn && " ✓"}
                    </DropdownMenu.Item>
                  </>
                )}
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                {isLoggedIn || isDashboard ? (
                  <>
                    {(!UNDER_CONSTRUCTION || devViewOn) && (
                      <DropdownMenu.Item
                        className={itemClass}
                        onSelect={() => {
                          closeMenus();
                          router.push("/dashboard");
                        }}
                      >
                        <SafeIcon><LayoutDashboard className="h-3.5 w-3.5" /></SafeIcon>
                        {t("dashboard")}
                      </DropdownMenu.Item>
                    )}
                    <DropdownMenu.Item
                      className={cn(itemClass, "text-destructive focus:text-destructive")}
                      onSelect={logout}
                    >
                      <SafeIcon><LogOut className="h-3.5 w-3.5" /></SafeIcon>
                      {t("signOut")}
                    </DropdownMenu.Item>
                  </>
                ) : (
                  <>
                    <DropdownMenu.Item
                      className={itemClass}
                      onSelect={() => { closeMenus(); window.location.href = "/login"; }}
                    >
                      {t("signIn")}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={itemClass}
                      onSelect={() => { closeMenus(); window.location.href = "/signup"; }}
                    >
                      {t("signUp")}
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {/* Mobile: hamburger */}
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground sm:hidden"
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((o) => !o)}
          >
            {mobileNavOpen ? <SafeIcon><X className="h-5 w-5" /></SafeIcon> : <SafeIcon><Menu className="h-5 w-5" /></SafeIcon>}
          </button>
        </div>
      </div>

      {/* Mobile nav panel */}
      {mobileNavOpen && (
        <div
          className="header-bar-border absolute left-0 right-0 top-14 z-30 border-b bg-background/95 shadow-lg backdrop-blur sm:hidden"
        >
          {UNDER_CONSTRUCTION && isAdmin && isLoggedIn && (
            <div className="px-4 pt-3 pb-2 border-b border-border/60 mb-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">{t("viewModeLabel")}</p>
              <div className="flex rounded-lg border border-border bg-muted/50 p-0.5" role="group" aria-label={t("viewModeLabel")}>
                <button
                  type="button"
                  onClick={() => { handleDevViewToggle(false); closeMenus(); }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 rounded-md py-2.5 text-xs font-medium transition-colors",
                    !devViewOn ? "bg-background text-foreground shadow" : "text-muted-foreground"
                  )}
                  aria-pressed={!devViewOn}
                >
                  <SafeIcon><Construction className="h-3.5 w-3.5" aria-hidden /></SafeIcon>
                  {t("underDevView")}
                </button>
                <button
                  type="button"
                  onClick={() => { handleDevViewToggle(true); closeMenus(); }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 rounded-md py-2.5 text-xs font-medium transition-colors",
                    devViewOn ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  )}
                  aria-pressed={devViewOn}
                >
                  <SafeIcon><Code2 className="h-3.5 w-3.5" aria-hidden /></SafeIcon>
                  {t("fullSiteView")}
                </button>
              </div>
            </div>
          )}
          <nav className="flex flex-col gap-0.5 px-4 py-4" aria-label="Main">
            {navLinks.map(({ href, key, Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={closeMenus}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                  isActive(href)
                    ? "bg-accent/50 text-foreground"
                    : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
                )}
              >
                <SafeIcon><Icon className="h-4 w-4 shrink-0" /></SafeIcon>
                {t(key)}
              </Link>
            ))}
            <div className="my-2 h-px bg-border" />
            {isLoggedIn ? (
              <>
                {(!UNDER_CONSTRUCTION || devViewOn) && (
                  <Link
                    href="/dashboard"
                    onClick={closeMenus}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-foreground hover:bg-accent/30"
                  >
                    <SafeIcon><LayoutDashboard className="h-4 w-4" /></SafeIcon>
                    {t("dashboard")}
                  </Link>
                )}
                {isLoggedIn && (!UNDER_CONSTRUCTION || devViewOn) && <div className="my-2 h-px bg-border" />}
                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  <SafeIcon><LogOut className="h-4 w-4" /></SafeIcon>
                  {t("signOut")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { closeMenus(); window.location.href = "/login"; }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-muted-foreground hover:bg-accent/30 hover:text-foreground"
                >
                  {t("signIn")}
                </button>
                <button
                  type="button"
                  onClick={() => { closeMenus(); window.location.href = "/signup"; }}
                  className="flex w-full items-center justify-center rounded-lg bg-primary px-3 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {t("signUp")}
                </button>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
