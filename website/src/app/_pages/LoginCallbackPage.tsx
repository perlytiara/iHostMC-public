"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { getPath, type Locale } from "@/i18n/pathnames";
import { hasDevViewCookie } from "@/lib/dev-view";

function LoginCallbackContent() {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    const token = searchParams.get("token")?.trim();
    const sessionId = searchParams.get("session")?.trim() ?? null;
    const returnTo = searchParams.get("returnTo")?.trim();
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      return;
    }

    if (!token) {
      setStatus("error");
      return;
    }

    (async () => {
      try {
        const payload = JSON.parse(atob(token.split(".")[1] ?? "{}")) as { sub?: string; email?: string };
        const userId = payload.sub ?? "";
        const email = payload.email ?? "";
        if (userId && email && typeof window !== "undefined") {
          localStorage.setItem(
            "ihostmc-auth",
            JSON.stringify({ user: { token, userId, email } })
          );
        }

        let adminPreviewSet = false;
        try {
          const previewRes = await fetch("/api/admin-preview", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
          });
          if (previewRes.ok) {
            const body = await previewRes.json().catch(() => ({}));
            adminPreviewSet = body?.ok === true;
          }
        } catch {
          // ignore
        }

        setStatus("done");

        if (sessionId) {
          router.replace(getPath("confirmAccount", locale) + "?session=" + encodeURIComponent(sessionId));
          return;
        }

        const underConstruction = process.env.NEXT_PUBLIC_SITE_UNDER_CONSTRUCTION === "true";
        const defaultTarget =
          underConstruction && !adminPreviewSet && !hasDevViewCookie()
            ? getPath("home", locale)
            : getPath("dashboard", locale);
        const target =
          underConstruction
            ? defaultTarget
            : (returnTo?.startsWith("/") ? returnTo : returnTo ? `/${returnTo}` : defaultTarget);
        router.replace(target || defaultTarget);
      } catch {
        setStatus("error");
      }
    })();
  }, [searchParams, router, locale]);

  if (status === "loading") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-muted-foreground">
        <p>Signing you in…</p>
      </div>
    );
  }

  if (status === "error") {
    const error = searchParams.get("error");
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
        <p className="text-destructive">{error || "Sign-in failed"}</p>
        <a href={getPath("login", locale)} className="mt-4 text-sm text-primary hover:underline">
          Back to login
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-muted-foreground">
      <p>Redirecting…</p>
    </div>
  );
}

export default function LoginCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
          Loading…
        </div>
      }
    >
      <LoginCallbackContent />
    </Suspense>
  );
}
