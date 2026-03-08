"use client";

import { Suspense, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getApiBaseUrl } from "@/lib/api";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { RECAPTCHA_SITE_KEY } from "@/lib/recaptcha";
import { useRecaptcha, RecaptchaWidget } from "@/components/Recaptcha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ResetPasswordContent() {
  const t = useTranslations("resetPassword");
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token"), [searchParams]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { ready: recaptchaReady, getToken: getRecaptchaToken, reset: resetRecaptcha, skipRecaptcha } = useRecaptcha(RECAPTCHA_SITE_KEY);

  const parsed = useMemo(
    () => (token ? resetPasswordSchema.safeParse({ token, password, confirmPassword: confirm }) : null),
    [token, password, confirm]
  );
  const isValid = parsed?.success ?? false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    setFieldErrors({});
    const recaptchaToken = skipRecaptcha ? "dev-bypass" : getRecaptchaToken();
    if (!skipRecaptcha && !recaptchaToken) {
      setError("Please complete the reCAPTCHA. If the box didn't appear, try refreshing.");
      return;
    }
    const result = resetPasswordSchema.safeParse({ token, password, confirmPassword: confirm });
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
    setLoading(true);
    try {
      const base = getApiBaseUrl();
      const url = base ? `${base}/api/auth/reset-password` : "/api/auth/reset-password";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: result.data.token, password: result.data.password, recaptchaToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Reset failed");
        resetRecaptcha();
        return;
      }
      resetRecaptcha();
      setSuccess(true);
    } catch {
      setError("Network error");
      resetRecaptcha();
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-xl font-semibold text-destructive">{t("invalid")}</h1>
          <Button asChild><Link href="/login">{t("backToLogin")}</Link></Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-xl font-semibold text-emerald-500">{t("success")}</h1>
          <Button asChild><Link href="/login">{t("backToLogin")}</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-center">{t("title")}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="reset-password">{t("newPassword")}</Label>
            <Input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1"
              minLength={8}
            />
            {fieldErrors.password && <p className="text-sm text-destructive mt-0.5">{fieldErrors.password}</p>}
          </div>
          <div>
            <Label htmlFor="reset-confirm">{t("confirmPassword")}</Label>
            <Input
              id="reset-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1"
            />
            {fieldErrors.confirmPassword && <p className="text-sm text-destructive mt-0.5">{fieldErrors.confirmPassword}</p>}
          </div>
          {!skipRecaptcha && <RecaptchaWidget siteKey={RECAPTCHA_SITE_KEY} theme="dark" className="my-2" />}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading || !isValid || (!skipRecaptcha && !recaptchaReady)} className="w-full">
            {loading ? "Resetting..." : t("submit")}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">{t("backToLogin")}</Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
