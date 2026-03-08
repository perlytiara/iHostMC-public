"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getPath, type Locale } from "@/i18n/pathnames";
import { getApiBaseUrl, getStoredToken } from "@/lib/api";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 3000;

function VerifyEmailWaitContent() {
  const t = useTranslations("verifyEmailWait");
  const router = useRouter();
  const locale = useLocale() as Locale;
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session")?.trim() ?? null;
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      const loginPath = getPath("login", locale) + (sessionId ? "?session=" + encodeURIComponent(sessionId) : "");
      router.replace(loginPath);
      return;
    }

    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const text = await res.text();
        let data: { emailVerified?: boolean } = {};
        try {
          if (text) data = JSON.parse(text);
        } catch {
          if (cancelled) return;
          setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }
        if (data.emailVerified) {
          if (sessionId) {
            router.replace(getPath("confirmAccount", locale) + "?session=" + encodeURIComponent(sessionId));
          } else {
            router.replace("/dashboard");
          }
          return;
        }
      } catch {
        if (cancelled) return;
      }
      if (cancelled) return;
      setTimeout(poll, POLL_INTERVAL_MS);
    };

    const poll = () => {
      if (cancelled) return;
      check();
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [router, sessionId, locale]);

  const handleResend = async () => {
    const token = getStoredToken();
    if (!token) return;
    const r = await fetch(`${getApiBaseUrl()}/api/auth/send-verification-email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) setResendSent(true);
  };

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex justify-center">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        </div>
        <p className="text-xs text-muted-foreground">{t("autoRefresh")}</p>
        <Button type="button" variant="outline" size="sm" disabled={resendSent} onClick={handleResend}>
          {resendSent ? t("resendSent") : t("resend")}
        </Button>
      </div>
    </div>
  );
}

export default function VerifyEmailWaitPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <VerifyEmailWaitContent />
    </Suspense>
  );
}
