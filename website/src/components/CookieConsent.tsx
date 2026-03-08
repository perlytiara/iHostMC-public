"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const CONSENT_KEY = "ihostmc-consent";
type ConsentValue = "granted" | "denied";

declare global {
  interface Window {
    gtag?: (command: string, action: string, params?: Record<string, string>) => void;
    dataLayer?: unknown[];
  }
}

/** Consent mode v2: update all four parameters so GA4 and GTM behave correctly (GDPR/EEA). */
function updateGtagConsent(analytics: boolean) {
  if (typeof window === "undefined" || !window.gtag) return;
  const value = analytics ? "granted" : "denied";
  window.gtag("consent", "update", {
    analytics_storage: value,
    ad_storage: value,
    ad_user_data: value,
    ad_personalization: value,
  });
}

function getStoredConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    if (v === "granted" || v === "denied") return v;
  } catch {
    // ignore
  }
  return null;
}

function setStoredConsent(value: ConsentValue) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // ignore
  }
}

export function CookieConsent() {
  const t = useTranslations("cookieConsent");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = getStoredConsent();
    if (stored !== null) {
      updateGtagConsent(stored === "granted");
      return;
    }
    setOpen(true);
  }, []);

  const acceptAll = () => {
    updateGtagConsent(true);
    setStoredConsent("granted");
    setOpen(false);
  };

  const essentialOnly = () => {
    updateGtagConsent(false);
    setStoredConsent("denied");
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 rounded-xl border border-border bg-card/95 backdrop-blur shadow-lg px-4 py-3"
      role="dialog"
      aria-label={t("title")}
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs sm:text-sm text-muted-foreground leading-snug">
          {t("message")}{" "}
          <Link href="/privacy" className="underline hover:text-foreground inline">
            {t("privacyLink")}
          </Link>
          {" · "}
          <Link href="/cookies" className="underline hover:text-foreground inline">
            {t("cookieLink")}
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={essentialOnly} className="text-xs">
            {t("essentialOnly")}
          </Button>
          <Button size="sm" onClick={acceptAll} className="text-xs">
            {t("acceptAll")}
          </Button>
        </div>
      </div>
    </div>
  );
}
