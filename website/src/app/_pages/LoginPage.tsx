"use client";

import { Suspense, useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getPath, type Locale } from "@/i18n/pathnames";
import { getApiBaseUrl, getStoredAuth, registerSessionAndRedirect, responseJson } from "@/lib/api";
import { hasDevViewCookie } from "@/lib/dev-view";
import { loginSchema } from "@/lib/validations/auth";
import { RECAPTCHA_SITE_KEY } from "@/lib/recaptcha";
import { useRecaptcha, RecaptchaWidget } from "@/components/Recaptcha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const OAUTH_LABELS: Record<string, string> = {
  google: "Continue with Google",
  github: "Continue with GitHub",
  discord: "Continue with Discord",
  microsoft: "Continue with Microsoft",
};

function LoginContent() {
  const t = useTranslations("auth");
  const router = useRouter();
  const locale = useLocale() as Locale;
  const searchParams = useSearchParams();
  const sessionId = useMemo(() => searchParams.get("session")?.trim() ?? null, [searchParams]);
  const redirectReason = useMemo(() => searchParams.get("reason") ?? null, [searchParams]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [networkErrorHint, setNetworkErrorHint] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<string[]>([]);
  const { ready: recaptchaReady, getToken: getRecaptchaToken, reset: resetRecaptcha, skipRecaptcha } = useRecaptcha(RECAPTCHA_SITE_KEY);

  const existingAuth = useMemo(() => getStoredAuth(), []);

  useEffect(() => {
    const base = getApiBaseUrl();
    const authBase = base || "";
    const providersUrl = authBase ? `${authBase}/api/auth/providers` : "/api/auth/providers";
    fetch(providersUrl)
      .then((r) => responseJson(r, { providers: [] as string[] }))
      .then((data) => setOauthProviders(data?.providers ?? []))
      .catch(() => setOauthProviders([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNetworkErrorHint(false);
    const recaptchaToken = skipRecaptcha ? "dev-bypass" : getRecaptchaToken();
    if (!skipRecaptcha && !recaptchaToken) {
      setError("Please complete the reCAPTCHA. If the box didn't appear, try refreshing or disabling ad blockers.");
      return;
    }
    const parsed = loginSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid email or password");
      return;
    }
    const apiBase = getApiBaseUrl();
    const useProxy = process.env.NEXT_PUBLIC_USE_API_PROXY === "true";
    if (!apiBase && !useProxy) {
      setError("Backend not configured. Set NEXT_PUBLIC_API_URL in .env or run the backend on port 3010.");
      return;
    }
    setLoading(true);
    try {
      const authUrl = apiBase ? `${apiBase}/api/auth/login` : "/api/auth/login";
      const res = await fetch(authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, recaptchaToken }),
      });
      const text = await res.text();
      let data: Record<string, string> & { emailVerified?: boolean } = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          setError(res.ok ? "Invalid response" : text.slice(0, 100) || "Login failed");
          setLoading(false);
          return;
        }
      }
      if (!res.ok) {
        const errMsg = data.error || "Login failed";
        const friendly =
          errMsg === "invalid-input-response" || String(errMsg).includes("invalid-input-response")
            ? "Verification expired or invalid. Please try again."
            : errMsg;
        setError(friendly);
        resetRecaptcha();
        setLoading(false);
        return;
      }
      resetRecaptcha();
      const token = data.token ?? "";
      const userId = data.userId ?? "";
      const emailVal = data.email ?? "";
      const emailVerified = data.emailVerified !== false;
      if (typeof window !== "undefined") {
        localStorage.setItem("ihostmc-auth", JSON.stringify({ user: { token, userId, email: emailVal } }));
      }

      // Set admin-preview cookie if user is admin; use response to decide redirect (cookie is httpOnly so we can't read it here)
      let adminPreviewSet = false;
      try {
        const previewRes = await fetch("/api/admin-preview", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (previewRes.ok) {
          const body = await responseJson(previewRes, { ok: false });
          adminPreviewSet = body?.ok === true;
        }
      } catch {
        // ignore
      }

      if (!emailVerified) {
        const waitPath = getPath("verifyEmailWait", locale);
        router.replace(sessionId ? waitPath + "?session=" + encodeURIComponent(sessionId) : waitPath);
        setLoading(false);
        return;
      }

      if (sessionId) {
        router.replace(getPath("confirmAccount", locale) + "?session=" + encodeURIComponent(sessionId));
        setLoading(false);
        return;
      }
      const underConstruction = process.env.NEXT_PUBLIC_SITE_UNDER_CONSTRUCTION === "true";
      const sendToHome = underConstruction && !adminPreviewSet && !hasDevViewCookie();
      router.replace(sendToHome ? getPath("home", locale) : getPath("dashboard", locale));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("networkError");
      setError(message);
      resetRecaptcha();
      const apiUrl = getApiBaseUrl();
      setNetworkErrorHint(Boolean(typeof window !== "undefined" && apiUrl.startsWith("http:")));
    } finally {
      setLoading(false);
    }
  };

  if (sessionId && existingAuth) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px] rounded-2xl border border-border/80 bg-card/60 shadow-sm backdrop-blur-sm p-6 sm:p-8 space-y-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">{t("connectApp")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("loggedInAs", { email: existingAuth.email })}
          </p>
          <div className="flex flex-col gap-2">
            <Button
              onClick={async () => {
                await registerSessionAndRedirect(sessionId, existingAuth);
                await new Promise((r) => setTimeout(r, 200));
                const underDev = process.env.NEXT_PUBLIC_SITE_UNDER_CONSTRUCTION === "true" && !hasDevViewCookie();
                router.replace((underDev ? getPath("home", locale) : getPath("dashboard", locale)) + "?signed_in=app");
              }}
            >
              {t("connectAndAuthorize")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (typeof window !== "undefined") localStorage.removeItem("ihostmc-auth");
                window.location.reload();
              }}
            >
              {t("useDifferentAccount")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const sessionMessage =
    redirectReason === "session_expired" ? t("sessionExpired") : redirectReason === "invalid" ? t("invalidSession") : null;

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-[400px] rounded-2xl border border-border/80 bg-card/60 shadow-sm backdrop-blur-sm p-6 sm:p-8 space-y-6">
        {sessionMessage && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-sm px-4 py-3 text-center">
            {sessionMessage}
          </div>
        )}
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{t("login")}</h1>
          <p className="text-sm text-muted-foreground">Sign in to your iHostMC account</p>
        </div>
        {oauthProviders.length > 0 && (
          <div className="space-y-2">
            {oauthProviders.map((provider) => {
              const params = new URLSearchParams();
              const underDev = process.env.NEXT_PUBLIC_SITE_UNDER_CONSTRUCTION === "true" && !hasDevViewCookie();
              params.set("returnTo", underDev ? getPath("home", locale) : getPath("dashboard", locale));
              if (sessionId) params.set("session", sessionId);
              const base = getApiBaseUrl();
              const href = (base ? `${base}/api/auth/${provider}` : `/api/auth/${provider}`) + `?${params.toString()}`;
              return (
                <Button
                  key={provider}
                  type="button"
                  variant="outline"
                  className="w-full"
                  asChild
                >
                  <a href={href}>{OAUTH_LABELS[provider] ?? `Continue with ${provider}`}</a>
                </Button>
              );
            })}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
                <span className="bg-card px-2">or</span>
              </div>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="login-email">{t("email")}</Label>
            <Input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1.5"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <div className="flex justify-between items-center">
              <Label htmlFor="login-password">{t("password")}</Label>
              <Link href="/forgot-password" className="text-xs text-muted-foreground hover:underline">{t("forgotPassword")}</Link>
            </div>
            <Input
              id="login-password"
              name="current-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1.5"
            />
          </div>
          {!skipRecaptcha && <RecaptchaWidget siteKey={RECAPTCHA_SITE_KEY} theme="dark" className="my-2" />}
          {error && (
            <div className="text-sm space-y-1">
              <p className="text-destructive">{error}</p>
              {networkErrorHint && <p className="text-muted-foreground">{t("networkErrorHint")}</p>}
            </div>
          )}
          <Button type="submit" disabled={loading} className="w-full mt-1">
            {loading ? t("signingIn") : t("login")}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground pt-1">
          {t("noAccount")} <Link href="/signup" className="text-primary hover:underline font-medium">{t("signUp")}</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
