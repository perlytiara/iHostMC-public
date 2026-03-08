import { Resend } from "resend";
import { config } from "../config.js";
import {
  verifyEmailStrings,
  resetPasswordStrings,
  normalizeEmailLocale,
  type EmailLocale,
} from "./email-strings.js";

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

function buildVerifyEmailHtml(locale: EmailLocale, verifyUrl: string): string {
  const s = verifyEmailStrings[locale];
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${s.subject}</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <p>${s.bodyIntro}</p>
  <p><a href="${verifyUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;">${s.buttonText}</a></p>
  <p style="color:#666;font-size:14px;">${s.bodyOutro}</p>
</body>
</html>`;
}

function buildResetPasswordHtml(locale: EmailLocale, resetUrl: string): string {
  const s = resetPasswordStrings[locale];
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${s.subject}</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <p>${s.bodyIntro}</p>
  <p><a href="${resetUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;">${s.buttonText}</a></p>
  <p style="color:#666;font-size:14px;">${s.bodyOutro}</p>
</body>
</html>`;
}

export function canSendEmail(): boolean {
  return Boolean(resend);
}

export async function sendVerificationEmail(
  to: string,
  verifyToken: string,
  locale: string | undefined
): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: "Email not configured" };
  const loc = normalizeEmailLocale(locale);
  const baseUrl = config.websiteUrl.replace(/\/$/, "");
  const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(verifyToken)}`;
  const subject = verifyEmailStrings[loc].subject;
  const html = buildVerifyEmailHtml(loc, verifyUrl);
  try {
    const { error } = await resend.emails.send({
      from: config.resendFrom,
      to: [to],
      subject,
      html,
    });
    if (error) {
      console.error("[email] Verification send failed:", error.message, "to:", to);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[email] Verification send error:", msg, "to:", to);
    return { ok: false, error: msg };
  }
}

export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  locale: string | undefined
): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: "Email not configured" };
  const loc = normalizeEmailLocale(locale);
  const baseUrl = config.websiteUrl.replace(/\/$/, "");
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
  const subject = resetPasswordStrings[loc].subject;
  const html = buildResetPasswordHtml(loc, resetUrl);
  try {
    const { error } = await resend.emails.send({
      from: config.resendFrom,
      to: [to],
      subject,
      html,
    });
    if (error) {
      console.error("[email] Password reset send failed:", error.message, "to:", to);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[email] Password reset send error:", msg, "to:", to);
    return { ok: false, error: msg };
  }
}
