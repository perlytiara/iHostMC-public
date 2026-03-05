import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AppLogo } from "./AppLogo";
import { Button } from "./ui/button";
import { ArrowRight, X, Sparkles } from "lucide-react";

const STORAGE_KEY = "ihostmc-onboarding-complete";

const steps = [
  { titleKey: "onboarding.welcomeTitle", descKey: "onboarding.welcomeDesc" },
  { titleKey: "onboarding.navTitle", descKey: "onboarding.navDesc" },
  { titleKey: "onboarding.createTitle", descKey: "onboarding.createDesc" },
  { titleKey: "onboarding.settingsTitle", descKey: "onboarding.settingsDesc" },
  { titleKey: "onboarding.readyTitle", descKey: "onboarding.readyDesc" },
];

export function OnboardingOverlay() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setShow(true);
      }
    } catch {}
  }, []);

  const complete = () => {
    setShow(false);
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
  };

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else complete();
  };

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl"
        >
          <button
            type="button"
            onClick={complete}
            className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center text-center"
            >
              {step === 0 && (
                <motion.div
                  animate={{ y: [-4, 4, -4] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="mb-4"
                >
                  <AppLogo size={88} />
                </motion.div>
              )}

              {step === steps.length - 1 && (
                <motion.div
                  initial={{ rotate: 0 }}
                  animate={{ rotate: [0, -10, 10, -10, 0] }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="mb-4"
                >
                  <Sparkles className="h-12 w-12 text-primary" />
                </motion.div>
              )}

              <h3 className="text-xl font-bold text-foreground">
                {t(steps[step].titleKey)}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {t(steps[step].descKey)}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Progress dots */}
          <div className="mt-6 flex items-center justify-center gap-1.5">
            {steps.map((_, i) => (
              <motion.div
                key={i}
                className={`h-1.5 rounded-full transition-colors ${i === step ? "bg-primary" : "bg-muted"}`}
                animate={{ width: i === step ? 20 : 6 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={complete}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("onboarding.skip")}
            </button>
            <Button size="sm" onClick={next} className="gap-1.5">
              {step === steps.length - 1 ? t("onboarding.getStarted") : t("onboarding.next")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
