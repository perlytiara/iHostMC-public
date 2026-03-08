"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { getPath, type Locale } from "@/i18n/pathnames";
import { getApiBaseUrl, getStoredAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";

function VerifyEmailContent() {
  const t = useTranslations("verifyEmail");
  const router = useRouter();
  const locale = useLocale() as Locale;
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error" | "waiting">(token ? "loading" : "waiting");
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${getApiBaseUrl()}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.text().then((t) => { try { return t ? JSON.parse(t) : {}; } catch { return {}; } }))
      .then((data) => {
        setStatus(data?.ok ? "success" : "error");
        if (data?.ok) {
          setTimeout(() => router.replace(getPath("dashboard", locale)), 1500);
        }
      })
      .catch(() => setStatus("error"));
  }, [token, router, locale]);

  if (status === "waiting") {
    const auth = getStoredAuth();
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("checkInbox")}</p>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              disabled={!auth?.token || resendSent}
              onClick={async () => {
                if (!auth?.token) return;
                const r = await fetch(getApiBaseUrl() + "/api/auth/send-verification-email", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${auth.token}` },
                });
                if (r.ok) setResendSent(true);
              }}
            >
              {resendSent ? t("resendSent") : t("resend")}
            </Button>
            <Button asChild>
              <Link href={getPath("dashboard", locale)}>{t("continueToDashboard")}</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("alreadyVerified")}</p>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
        <p className="text-muted-foreground">{t("verifying")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md text-center space-y-4">
        {status === "success" ? (
          <>
            <h1 className="text-xl font-semibold text-emerald-500">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("success")}</p>
            <p className="text-sm text-muted-foreground">{t("redirecting")}</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-destructive">{t("invalid")}</h1>
            <p className="text-sm text-muted-foreground">{t("invalid")}</p>
            <Button asChild>
              <Link href="/login">{t("backToLogin")}</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
