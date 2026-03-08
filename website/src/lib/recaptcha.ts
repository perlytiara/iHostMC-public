/** reCAPTCHA v2 site key (public). Set NEXT_PUBLIC_RECAPTCHA_SITE_KEY in .env to override. Empty when NEXT_PUBLIC_SKIP_RECAPTCHA=true (dev). */
export const RECAPTCHA_SITE_KEY =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SKIP_RECAPTCHA === "true"
    ? ""
    : typeof process !== "undefined" && process.env?.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
      ? process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
      : "6LdATn8sAAAAAFL3kKNJ1hTLVIvqDCSeMepEF2wS";
