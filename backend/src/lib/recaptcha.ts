import { config } from "../config.js";

const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export interface VerifyResult {
  success: boolean;
  error?: string;
}

/**
 * Verify a reCAPTCHA v2 response token with Google.
 * Returns { success: true } when valid; { success: false, error } when missing key, invalid token, or request failed.
 */
const DEV_BYPASS_TOKEN = "dev-bypass";

const ALLOW_EMPTY =
  typeof process !== "undefined" && process.env?.RECAPTCHA_ALLOW_EMPTY === "true";

export async function verifyRecaptcha(token: string | undefined): Promise<VerifyResult> {
  if (!config.recaptchaSecretKey || config.recaptchaSecretKey.trim() === "") {
    return { success: true };
  }
  const t = typeof token === "string" ? token.trim() : "";
  if (!t) {
    if (ALLOW_EMPTY) return { success: true };
    return { success: false, error: "reCAPTCHA required" };
  }
  if (t === DEV_BYPASS_TOKEN) {
    return { success: true };
  }
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: config.recaptchaSecretKey,
        response: t,
      }),
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success) {
      return { success: true };
    }
    const codes = data["error-codes"];
    if (ALLOW_EMPTY && Array.isArray(codes) && codes.includes("invalid-input-response")) {
      return { success: true };
    }
    const raw = Array.isArray(codes) && codes.length > 0 ? codes.join(", ") : "Verification failed";
    const msg =
      raw === "invalid-input-response" || (Array.isArray(codes) && codes?.includes("invalid-input-response"))
        ? "Verification expired. Please try again."
        : raw;
    return { success: false, error: msg };
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return { success: false, error: err };
  }
}
