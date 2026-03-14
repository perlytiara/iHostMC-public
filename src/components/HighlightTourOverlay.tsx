import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { ArrowRight } from "lucide-react";

const PADDING = 12;
const STORAGE_KEY = "ihostmc-highlight-tour-complete";

export interface HighlightStep {
  targetSelector: string;
  titleKey: string;
  descKey: string;
}

export interface HighlightTourOverlayProps {
  /** When false, nothing is rendered. */
  active: boolean;
  /** Current step index (0-based). Steps are defined in the component from i18n. */
  step: number;
  /** Called when user clicks Next on a step. */
  onNext: () => void;
  /** Called when tour is finished (last step Next or Skip). */
  onComplete: () => void;
}

const STEP_SELECTORS: string[] = ["[data-tour=create-server]", "[data-tour=import-server]"];

export function HighlightTourOverlay({ active, step, onNext, onComplete }: HighlightTourOverlayProps) {
  const { t } = useTranslation();
  const [rect, setRect] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    if (!active || step < 0 || step >= STEP_SELECTORS.length) {
      setRect(null);
      return;
    }
    const el = document.querySelector(STEP_SELECTORS[step]);
    if (!el) {
      setRect(null);
      return;
    }
    setRect(el.getBoundingClientRect());
  }, [active, step]);

  useEffect(() => {
    if (!active) return;
    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", measure, true);
    const interval = setInterval(measure, 200);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", measure, true);
      clearInterval(interval);
    };
  }, [active, measure]);

  if (!active || step < 0 || step >= STEP_SELECTORS.length) return null;

  const titleKey = step === 0 ? "tour.createTitle" : "tour.importTitle";
  const descKey = step === 0 ? "tour.createDesc" : "tour.importDesc";
  const isLast = step === STEP_SELECTORS.length - 1;

  const handleNext = () => {
    if (isLast) onComplete();
    else onNext();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99] pointer-events-auto"
        aria-modal
        role="dialog"
        aria-label={t("tour.ariaLabel")}
      >
        {/* Dimmed overlay with cutout using 4 strips */}
        <div className="absolute inset-0">
          {rect && (
            <>
              <div
                className="absolute left-0 right-0 top-0 bg-black/60 transition-opacity"
                style={{ height: Math.max(0, rect.top - PADDING) }}
              />
              <div
                className="absolute left-0 right-0 bottom-0 bg-black/60 transition-opacity"
                style={{
                  top: rect.bottom + PADDING,
                  height: Math.max(0, window.innerHeight - rect.bottom - PADDING),
                }}
              />
              <div
                className="absolute top-0 bottom-0 left-0 bg-black/60 transition-opacity"
                style={{
                  width: Math.max(0, rect.left - PADDING),
                  top: Math.max(0, rect.top - PADDING),
                  height: rect.height + PADDING * 2,
                }}
              />
              <div
                className="absolute top-0 bottom-0 right-0 bg-black/60 transition-opacity"
                style={{
                  left: rect.right + PADDING,
                  width: Math.max(0, window.innerWidth - rect.right - PADDING),
                  top: Math.max(0, rect.top - PADDING),
                  height: rect.height + PADDING * 2,
                }}
              />
            </>
          )}
        </div>

        {/* Tooltip card: below or above the target, positioned to stay within viewport */}
        {rect && (() => {
          const TOOLTIP_SPACING = 16;
          const TOOLTIP_HEIGHT_ESTIMATE = 140; // Approximate height of tooltip
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;
          
          // Check if there's enough space below
          const spaceBelow = viewportHeight - rect.bottom - PADDING;
          const spaceAbove = rect.top - PADDING;
          const showBelow = spaceBelow >= TOOLTIP_HEIGHT_ESTIMATE || spaceBelow > spaceAbove;
          
          // Calculate vertical position
          const topPosition = showBelow 
            ? rect.bottom + PADDING + TOOLTIP_SPACING
            : rect.top - TOOLTIP_HEIGHT_ESTIMATE - PADDING - TOOLTIP_SPACING;
          
          // Ensure tooltip stays within viewport bounds
          const clampedTop = Math.max(PADDING, Math.min(topPosition, viewportHeight - TOOLTIP_HEIGHT_ESTIMATE - PADDING));
          
          // Calculate horizontal position (center on target, but clamp to viewport)
          const tooltipWidth = Math.min(384, viewportWidth - PADDING * 2); // max-w-sm = 384px
          const targetCenterX = rect.left + rect.width / 2;
          const tooltipLeft = Math.max(
            PADDING,
            Math.min(targetCenterX - tooltipWidth / 2, viewportWidth - tooltipWidth - PADDING)
          );
          
          return (
            <motion.div
              initial={{ opacity: 0, y: showBelow ? 8 : -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: showBelow ? -8 : 8 }}
              className="absolute w-full max-w-sm px-4"
              style={{
                top: clampedTop,
                left: tooltipLeft,
                width: tooltipWidth,
              }}
            >
              <div className="rounded-xl border border-border bg-card p-4 shadow-xl">
                <p className="font-semibold text-foreground">{t(titleKey)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t(descKey)}</p>
                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={onComplete}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t("onboarding.skip")}
                  </button>
                  <Button size="sm" onClick={handleNext} className="gap-1.5">
                    {isLast ? t("tour.done") : t("onboarding.next")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </motion.div>
          );
        })()}
      </motion.div>
    </AnimatePresence>
  );
}

export function getHighlightTourComplete(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) === "1";
}

export function setHighlightTourComplete(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {}
}
