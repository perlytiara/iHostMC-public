"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppLogo } from "@/components/AppLogo";

/**
 * Full-screen loading UI with Discord-style progress bar.
 * Respects the theme already applied by the inline script in index.html.
 * Soft, modern look with no harsh spinners.
 */
export function LoadingScreen() {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 2200;
    const target = 0.92;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // Ease-out: fast at start, slow near the end (Discord-like)
      const eased = 1 - (1 - t) * (1 - t);
      const value = eased * target;
      setProgress(value);
      if (t < 1) requestAnimationFrame(tick);
    };

    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className="fixed inset-0 flex min-h-full min-w-full flex-col items-center justify-center bg-background text-foreground"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={t("common.loading")}
    >
      <div className="flex w-full max-w-[28rem] flex-col items-center gap-8 px-12 py-12">
        <div className="opacity-95 transition-opacity duration-300">
          <AppLogo size={120} />
        </div>

        <div className="w-full space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/90">
            <div
              className="h-full rounded-full transition-[width] duration-150 ease-out"
              style={{
                width: `${progress * 100}%`,
                background: "hsl(var(--muted-foreground) / 0.55)",
              }}
            />
          </div>
          <p className="text-center text-[0.9375rem] font-medium tracking-wide text-muted-foreground">
            {t("common.loading")}
          </p>
        </div>
      </div>
    </div>
  );
}
