"use client";

import { useState, useEffect, useCallback } from "react";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      getResponse: () => string;
      reset: () => void;
    };
  }
}

function loadRecaptchaScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.grecaptcha) return Promise.resolve();
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://www.google.com/recaptcha/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.grecaptcha?.ready(() => resolve());
    };
    document.head.appendChild(script);
  });
}

export function useRecaptcha(siteKey: string) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!siteKey) return;
    loadRecaptchaScript()
      .then(() => setReady(true))
      .catch(() => setReady(false));
  }, [siteKey]);

  const getToken = useCallback(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.grecaptcha?.getResponse() ?? "";
    } catch {
      return "";
    }
  }, []);

  const reset = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.grecaptcha?.reset();
    } catch {
      // ignore "No reCAPTCHA clients exist" etc.
    }
  }, []);

  const skipRecaptcha = !siteKey;

  return { ready, getToken, reset, skipRecaptcha };
}

interface RecaptchaWidgetProps {
  siteKey: string;
  theme?: "light" | "dark";
  className?: string;
}

export function RecaptchaWidget({ siteKey, theme = "dark", className = "" }: RecaptchaWidgetProps) {
  const { ready } = useRecaptcha(siteKey);

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Loading reCAPTCHA…</p>;
  }

  return (
    <div className={`flex justify-center sm:justify-start [&_.g-recaptcha]:inline-block ${className}`}>
      <div
        className="g-recaptcha"
        data-sitekey={siteKey}
        data-theme={theme}
        aria-label="reCAPTCHA"
      />
    </div>
  );
}
