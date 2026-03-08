"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getPath, type Locale } from "@/i18n/pathnames";
import { getStoredAuth, registerSessionAndRedirect } from "@/lib/api";
import { hasDevViewCookie } from "@/lib/dev-view";
import { Button } from "@/components/ui/button";

function ConfirmAccountContent() {
  const t = useTranslations("confirmAccount");
  const router = useRouter();
  const locale = useLocale() as Locale;
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session")?.trim() ?? null;
  const [auth, setAuth] = useState<{ token: string; userId: string; email: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  useEffect(() => {
    const stored = getStoredAuth();
    if (!stored) {
      router.replace(getPath("login", locale) + (sessionId ? "?session=" + encodeURIComponent(sessionId) : ""));
      return;
    }
    if (!sessionId) {
      (async () => {
        let adminPreviewSet = false;
        try {
          const previewRes = await fetch("/api/admin-preview", {
            method: "POST",
            headers: { Authorization: `Bearer ${stored.token}` },
            credentials: "include",
          });
          if (previewRes.ok) {
            const body = await previewRes.json().catch(() => ({}));
            adminPreviewSet = body?.ok === true;
          }
        } catch {
          // ignore
        }
        const underConstruction = process.env.NEXT_PUBLIC_SITE_UNDER_CONSTRUCTION === "true";
        const sendToHome = underConstruction && !adminPreviewSet && !hasDevViewCookie();
        router.replace(sendToHome ? getPath("home", locale) : getPath("dashboard", locale));
      })();
      return;
    }
    setAuth(stored);
  }, [router, sessionId, locale]);

  const useThisAccount = async () => {
    if (!auth || !sessionId) return;
    setSubmitting(true);
    setSessionError(false);
    const result = await registerSessionAndRedirect(sessionId, auth);
    if (!result.ok) {
      setSessionError(true);
      setSubmitting(false);
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
    let adminPreviewSet = false;
    try {
      const previewRes = await fetch("/api/admin-preview", {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.token}` },
        credentials: "include",
      });
      if (previewRes.ok) {
        const body = await previewRes.json().catch(() => ({}));
        adminPreviewSet = body?.ok === true;
      }
    } catch {
      // ignore
    }
    const underConstruction = process.env.NEXT_PUBLIC_SITE_UNDER_CONSTRUCTION === "true";
    const sendToHome = underConstruction && !adminPreviewSet && !hasDevViewCookie();
    router.replace((sendToHome ? getPath("home", locale) : getPath("dashboard", locale)) + "?signed_in=app");
  };

  const useDifferentAccount = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("ihostmc-auth");
    router.replace(getPath("login", locale) + "?session=" + encodeURIComponent(sessionId ?? ""));
  };

  if (!sessionId || !auth) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6">
          <h1 className="text-xl font-semibold text-center text-destructive">{t("sessionExpiredTitle")}</h1>
          <p className="text-sm text-muted-foreground text-center">{t("sessionExpiredDescription")}</p>
          <div className="flex flex-col gap-2">
            <Button
              className="w-full"
              onClick={() => router.replace(getPath("login", locale) + "?session=" + encodeURIComponent(sessionId))}
            >
              {t("tryAgainFromApp")}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                const underDev = process.env.NEXT_PUBLIC_SITE_UNDER_CONSTRUCTION === "true" && !hasDevViewCookie();
                router.replace(underDev ? getPath("home", locale) : getPath("dashboard", locale));
              }}
            >
              {t("goToDashboard")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-xl font-semibold text-center">{t("title")}</h1>
        <p className="text-sm text-muted-foreground text-center">{t("description")}</p>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-sm font-medium text-card-foreground">{auth.email}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Button className="w-full" onClick={useThisAccount} disabled={submitting}>
            {submitting ? t("redirecting") : t("useThisAccount")}
          </Button>
          <Button variant="outline" className="w-full" onClick={useDifferentAccount} disabled={submitting}>
            {t("differentAccount")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmAccountPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <ConfirmAccountContent />
    </Suspense>
  );
}
