"use client";

import { useState, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter, getLocalizedPath } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { getApiBaseUrl, responseJson } from "@/lib/api";
import { hasDevViewCookie } from "@/lib/dev-view";
import { getPath, type Locale } from "@/i18n/pathnames";
import { signupSchema } from "@/lib/validations/auth";
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

export default function SignupPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const locale = useLocale() as Locale;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<string[]>([]);
  const { ready: recaptchaReady, getToken: getRecaptchaToken, reset: resetRecaptcha, skipRecaptcha } = useRecaptcha(RECAPTCHA_SITE_KEY);

  useEffect(() => {
    const base = getApiBaseUrl();
    const providersUrl = base ? `${base}/api/auth/providers` : "/api/auth/providers";
    fetch(providersUrl)
      .then((r) => responseJson(r, { providers: [] as string[] }))
      .then((data) => setOauthProviders(data?.providers ?? []))
      .catch(() => setOauthProviders([]));
  }, []);

  const parsed = useMemo(
    () => signupSchema.safeParse({ email, password, confirmPassword: confirm, displayName: displayName || undefined }),
    [email, password, confirm, displayName]
  );
  const usernameTrimmed = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const isValid = parsed.success;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    const recaptchaToken = skipRecaptcha ? "dev-bypass" : getRecaptchaToken();
    if (!skipRecaptcha && !recaptchaToken) {
      setError("Please complete the reCAPTCHA. If the box didn't appear, try refreshing or disabling ad blockers.");
      return;
    }
    const result = signupSchema.safeParse({ email, password, confirmPassword: confirm, displayName: displayName || undefined });
    if (!result.success) {
      const issues: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const path = err.path[0]?.toString();
        if (path && !issues[path]) issues[path] = err.message;
      });
      setFieldErrors(issues);
      setError(result.error.errors[0]?.message ?? "Please fix the errors below");
      return;
    }
    const apiBase = getApiBaseUrl();
    const useProxy = process.env.NEXT_PUBLIC_USE_API_PROXY === "true";
    if (!apiBase && !useProxy) {
      setError("Backend not configured. Set NEXT_PUBLIC_API_URL in .env or run the backend on port 3010.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const body: { email: string; password: string; displayName?: string; username?: string; recaptchaToken: string } = {
        email: result.data.email.trim(),
        password: result.data.password,
        recaptchaToken: recaptchaToken || "dev-bypass",
      };
      if (result.data.displayName && result.data.displayName.trim()) {
        body.displayName = result.data.displayName.trim();
      }
      if (usernameTrimmed.length >= 2) {
        body.username = usernameTrimmed;
      }
      const authUrl = apiBase ? `${apiBase}/api/auth/register` : "/api/auth/register";
      const res = await fetch(authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        if (text) data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // non-JSON response (e.g. HTML error page)
      }
      if (!res.ok) {
        const errMsg = String(data?.error || "Sign up failed");
        const friendly =
          errMsg === "invalid-input-response" || errMsg.includes("invalid-input-response")
            ? "Verification expired or invalid. Please try again."
            : errMsg;
        setError(friendly);
        resetRecaptcha();
        return;
      }
      resetRecaptcha();
      const auth = data?.token && data?.userId && data?.email
        ? { token: String(data.token), userId: String(data.userId), email: String(data.email) }
        : null;
      if (auth && typeof window !== "undefined") {
        localStorage.setItem("ihostmc-auth", JSON.stringify({ user: auth }));
      }
      setSuccess(true);
      if (auth) {
        try {
          const verifyBase = getApiBaseUrl();
          await fetch(verifyBase ? `${verifyBase}/api/auth/send-verification-email` : "/api/auth/send-verification-email", {
            method: "POST",
            headers: { Authorization: `Bearer ${auth.token}` },
          });
        } catch {
          // ignore
        }
        router.replace(getLocalizedPath("verifyEmail", locale));
      } else {
        const underDev = process.env.NEXT_PUBLIC_SITE_UNDER_CONSTRUCTION === "true" && !hasDevViewCookie();
        router.replace(underDev ? getPath("home", locale) : getLocalizedPath("dashboard", locale));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("networkError");
      setError(message);
      resetRecaptcha();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-[400px] rounded-2xl border border-border/80 bg-card/60 shadow-sm backdrop-blur-sm p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{t("signup")}</h1>
          <p className="text-sm text-muted-foreground">Create your iHostMC account</p>
        </div>
        {oauthProviders.length > 0 && (
          <div className="space-y-2">
            {oauthProviders.map((provider) => {
              const params = new URLSearchParams();
              const underDev = process.env.NEXT_PUBLIC_SITE_UNDER_CONSTRUCTION === "true" && !hasDevViewCookie();
              params.set("returnTo", underDev ? getPath("home", locale) : getPath("dashboard", locale));
              const base = getApiBaseUrl();
              const href = (base ? `${base}/api/auth/${provider}` : `/api/auth/${provider}`) + `?${params.toString()}`;
              return (
                <Button key={provider} type="button" variant="outline" className="w-full" asChild>
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
            <Label htmlFor="signup-email">{t("email")}</Label>
            <Input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5"
              placeholder="you@example.com"
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && <p className="text-sm text-destructive mt-0.5">{fieldErrors.email}</p>}
          </div>
          <div>
            <Label htmlFor="signup-display">{t("displayName")}</Label>
            <Input
              id="signup-display"
              name="display-name"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("displayNamePlaceholder")}
              className="mt-1.5"
              maxLength={100}
            />
          </div>
          <div>
            <Label htmlFor="signup-username">Username (optional)</Label>
            <Input
              id="signup-username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="myusername"
              className="mt-1.5"
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground mt-0.5">Letters, numbers, _ and - only. Min 2 characters.</p>
          </div>
          <div>
            <Label htmlFor="signup-password">{t("password")}</Label>
            <Input
              id="signup-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5"
              aria-invalid={!!fieldErrors.password}
            />
            {fieldErrors.password && <p className="text-sm text-destructive mt-0.5">{fieldErrors.password}</p>}
          </div>
          <div>
            <Label htmlFor="signup-confirm">{t("confirmPassword")}</Label>
            <Input
              id="signup-confirm"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1.5"
              aria-invalid={!!fieldErrors.confirmPassword}
            />
            {fieldErrors.confirmPassword && <p className="text-sm text-destructive mt-0.5">{fieldErrors.confirmPassword}</p>}
          </div>
          {!skipRecaptcha && <RecaptchaWidget siteKey={RECAPTCHA_SITE_KEY} theme="dark" className="my-2" />}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && (
            <p className="text-sm text-emerald-500">
              {t("checkEmailVerify")} Redirecting...
            </p>
          )}
          <Button type="submit" disabled={loading || !isValid} className="w-full mt-1">
            {loading ? t("signingUp") : t("signup")}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground pt-1">
          {t("hasAccount")} <Link href="/login" className="text-primary hover:underline font-medium">{t("login")}</Link>
        </p>
      </div>
    </div>
  );
}
