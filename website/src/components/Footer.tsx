"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SafeIcon } from "@/components/SafeIcon";
import { BRAND } from "@/lib/brand";
import { Github, ChevronDown, MapPin } from "lucide-react";

const REPO_AVAILABLE = process.env.NEXT_PUBLIC_REPO_AVAILABLE === "true";
const UNDER_CONSTRUCTION = process.env.NEXT_PUBLIC_SITE_UNDER_CONSTRUCTION !== "false";

export function Footer() {
  const t = useTranslations("footer");
  const [journeyOpen, setJourneyOpen] = useState(false);

  return (
    <footer className="mt-auto border-t border-border bg-card/40 px-4 py-10 md:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-semibold text-foreground mb-3">{BRAND.appName}</p>
            <p className="text-sm text-muted-foreground">{t("tagline")}</p>
            {REPO_AVAILABLE ? (
              <a
                href={BRAND.githubRepo}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <SafeIcon><Github className="h-4 w-4" /></SafeIcon>
                {t("supportUs")}
              </a>
            ) : (
              <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
                <SafeIcon><Github className="h-4 w-4" /></SafeIcon>
                {t("githubComingSoon")}
              </p>
            )}
          </div>
          <div>
            <p className="font-medium text-foreground mb-3">{t("product")}</p>
            <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link href="/products" className="hover:text-foreground transition-colors">
                {t("products")}
              </Link>
              <Link href="/pricing" className="hover:text-foreground transition-colors">
                {t("pricing")}
              </Link>
              <Link href="/docs" className="hover:text-foreground transition-colors">
                {t("docs")}
              </Link>
            </nav>
          </div>
          <div>
            <p className="font-medium text-foreground mb-3">{t("community")}</p>
            <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link href="/contribute" className="hover:text-foreground transition-colors">
                {t("contribute")}
              </Link>
              {REPO_AVAILABLE ? (
                <a
                  href={BRAND.githubRepo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  {t("github")}
                </a>
              ) : (
                <span className="text-muted-foreground">{t("githubComingSoon")}</span>
              )}
            </nav>
          </div>
          <div>
            <p className="font-medium text-foreground mb-3">{t("account")}</p>
            <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
              {!UNDER_CONSTRUCTION && (
                <Link href="/signup" className="hover:text-foreground transition-colors">
                  {t("signUp")}
                </Link>
              )}
              <Link href="/login" className="hover:text-foreground transition-colors">
                {t("signIn")}
              </Link>
              {!UNDER_CONSTRUCTION && (
                <Link href="/dashboard" className="hover:text-foreground transition-colors">
                  {t("app")}
                </Link>
              )}
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                {t("privacy")}
              </Link>
              <Link href="/cookies" className="hover:text-foreground transition-colors">
                {t("cookies")}
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                {t("terms")}
              </Link>
            </nav>
          </div>
        </div>

        {/* Hidden / expandable: GitHub soon + user journey */}
        <div className="mt-8 pt-6 border-t border-border">
          <button
            type="button"
            onClick={() => setJourneyOpen((o) => !o)}
            className="flex items-center gap-2 w-full text-left text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={journeyOpen}
          >
            {t("joinJourneyTitle")}
            <SafeIcon><ChevronDown className={`h-4 w-4 transition-transform ${journeyOpen ? "rotate-180" : ""}`} /></SafeIcon>
          </button>
          {journeyOpen && (
            <div className="mt-3 pl-0 space-y-2 text-sm text-muted-foreground">
              <p>{t("githubComingBody")}</p>
              <p>{t("joinJourneyBody")}</p>
              <ul className="list-disc list-inside space-y-1">
                <li>{t("joinStep1")}</li>
                <li>{t("joinStep2")}</li>
                <li>{t("joinStep3")}</li>
              </ul>
            </div>
          )}
        </div>

        {/* Where to find us: domains */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <SafeIcon><MapPin className="h-3.5 w-3.5" /></SafeIcon>
            {t("whereToFindUs")}
          </span>
          <span>ihost.one · mc.ihost.one · app.ihost.one · cloud.ihost.one · play.ihost.one</span>
        </div>

        <p className="mt-6 pt-4 border-t border-border text-center text-xs text-muted-foreground">
          {t("openSource")}
        </p>
      </div>
    </footer>
  );
}
