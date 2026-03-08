"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getApiBaseUrl } from "@/lib/api";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { RECAPTCHA_SITE_KEY } from "@/lib/recaptcha";
import { useRecaptcha, RecaptchaWidget } from "@/components/Recaptcha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const t = useTranslations("forgotPassword");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { ready: recaptchaReady, getToken: getRecaptchaToken, reset: resetRecaptcha, skipRecaptcha } = useRecaptcha(RECAPTCHA_SITE_KEY);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const recaptchaToken = skipRecaptcha ? "dev-bypass" : getRecaptchaToken();
    if (!skipRecaptcha && !recaptchaToken) {
      setError("Please complete the reCAPTCHA. If the box didn't appear, try refreshing.");
      return;
    }
    const result = forgotPasswordSchema.safeParse({ email: email.trim() });
    if (!result.success) {
      setError(result.error.errors[0]?.message ?? "Invalid email");
      return;
    }
    setLoading(true);
    try {
      const base = getApiBaseUrl();
      const url = base ? `${base}/api/auth/forgot-password` : "/api/auth/forgot-password";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: result.data.email, recaptchaToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Request failed");
        resetRecaptcha();
        return;
      }
      resetRecaptcha();
      setSent(true);
    } catch {
      setError("Network error");
      resetRecaptcha();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-center">{t("title")}</h1>
        {sent ? (
          <p className="text-sm text-muted-foreground text-center">{t("sent")}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("description")}</p>
            <div>
              <Label htmlFor="forgot-email">Email</Label>
              <Input id="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1" />
            </div>
            {!skipRecaptcha && <RecaptchaWidget siteKey={RECAPTCHA_SITE_KEY} theme="dark" className="my-2" />}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading || (!skipRecaptcha && !recaptchaReady)} className="w-full">
              {loading ? "Sending..." : t("submit")}
            </Button>
          </form>
        )}
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">{t("backToLogin")}</Link>
        </p>
      </div>
    </div>
  );
}
