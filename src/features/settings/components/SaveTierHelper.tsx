"use client";

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveTier = "snapshot" | "structural" | "full";

const TIER_ORDER: SaveTier[] = ["snapshot", "structural", "full"];

/** Shuffle array (Fisher–Yates). */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function SaveTierHelper() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const questions = useMemo(
    () =>
      shuffle([
        {
          key: "space" as const,
          q: "settings.backupSync.tierQuestionSpace",
          qDefault: "I want to use…",
          options: [
            { labelKey: "settings.backupSync.tierMinimal", labelDefault: "As little space as possible", tier: "snapshot" as SaveTier },
            { labelKey: "settings.backupSync.tierModerate", labelDefault: "Moderate (config + mod lists)", tier: "structural" as SaveTier },
            { labelKey: "settings.backupSync.tierFull", labelDefault: "Full backups when I need them", tier: "full" as SaveTier },
          ],
        },
        {
          key: "care" as const,
          q: "settings.backupSync.tierQuestionCare",
          qDefault: "I care most about…",
          options: [
            { labelKey: "settings.backupSync.tierCareList", labelDefault: "Version & mod/plugin list only", tier: "snapshot" as SaveTier },
            { labelKey: "settings.backupSync.tierCareConfig", labelDefault: "Config files + mods + plugins", tier: "structural" as SaveTier },
            { labelKey: "settings.backupSync.tierCareAll", labelDefault: "Everything including worlds", tier: "full" as SaveTier },
          ],
        },
        {
          key: "when" as const,
          q: "settings.backupSync.tierQuestionWhen",
          qDefault: "I change mods or world…",
          options: [
            { labelKey: "settings.backupSync.tierRarely", labelDefault: "Rarely — light backups are fine", tier: "snapshot" as SaveTier },
            { labelKey: "settings.backupSync.tierSometimes", labelDefault: "Sometimes — config + mods", tier: "structural" as SaveTier },
            { labelKey: "settings.backupSync.tierOften", labelDefault: "Often — I want full restores", tier: "full" as SaveTier },
          ],
        },
      ]).slice(0, 2),
    []
  );

  const currentQ = questions[step];
  const allAnswered = Object.keys(answers).length >= questions.length;
  const suggestedTier = (() => {
    if (!allAnswered) return null;
    const chosen = questions.map((_, i) => questions[i]?.options[answers[i]]?.tier).filter(Boolean) as SaveTier[];
    if (chosen.length === 0) return null;
    const counts: Record<SaveTier, number> = { snapshot: 0, structural: 0, full: 0 };
    chosen.forEach((t) => { counts[t] = (counts[t] ?? 0) + 1; });
    return (TIER_ORDER as SaveTier[]).reduce((a, b) => (counts[b] > counts[a] ? b : a), chosen[0]);
  })();

  const handleAnswer = (optionIndex: number) => {
    setAnswers((prev) => ({ ...prev, [step]: optionIndex }));
    if (step < questions.length - 1) setStep((s) => s + 1);
  };

  const handleReset = () => {
    setStep(0);
    setAnswers({});
  };

  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted/30"
      >
        <span className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          {t("settings.backupSync.findSaveTier", "Find the right save type")}
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-border/50 px-3 py-3 space-y-3">
          {currentQ && step < questions.length && !allAnswered && (
            <>
              <p className="text-xs font-medium text-foreground">
                {t(currentQ.q, currentQ.qDefault)}
              </p>
              <div className="flex flex-wrap gap-2">
                {currentQ.options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAnswer(idx)}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      answers[step] === idx
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-background text-foreground hover:bg-muted/50"
                    )}
                  >
                    {t(opt.labelKey, opt.labelDefault)}
                  </button>
                ))}
              </div>
            </>
          )}
          {suggestedTier && allAnswered && (
            <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
              <p className="font-medium text-foreground">
                {t("settings.backupSync.suggestedTier", "Suggested for you")}:{" "}
                {suggestedTier === "snapshot"
                  ? t("settings.backupSync.tierNameSnapshot", "Snapshot")
                  : suggestedTier === "structural"
                    ? t("settings.backupSync.tierNameStructural", "Structural")
                    : t("settings.backupSync.tierNameFull", "Full")}
              </p>
              <p className="text-muted-foreground mt-0.5">
                {suggestedTier === "snapshot"
                  ? t("settings.backupSync.tierDescSnapshot", "Metadata only — smallest, free. Use for version & mod list.")
                  : suggestedTier === "structural"
                    ? t("settings.backupSync.tierDescStructural", "Config + mods + plugins — no worlds. Good balance.")
                    : t("settings.backupSync.tierDescFull", "Everything — worlds included. Use when you need full restores.")}
              </p>
              <p className="text-muted-foreground mt-1">
                {t("settings.backupSync.tierUseInServer", "Use this when creating a backup in Servers → select server → Backup & Sync.")}
              </p>
              <button
                type="button"
                onClick={handleReset}
                className="mt-2 text-xs text-primary hover:underline"
              >
                {t("settings.backupSync.tierTryAgain", "Try again")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
