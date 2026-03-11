"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/features/auth";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-store";
import { SettingsNavContext, DeveloperMenuContext } from "@/App";
import {
  getDevStorageSimulateFull,
  setDevStorageSimulateFull,
  getDevUsageUnlimited,
  setDevUsageUnlimited,
} from "@/lib/dev-overrides";

const DEV_TIER_SECRET_KEY = "ihostmc-dev-tier-secret";

function getStoredSecret(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(DEV_TIER_SECRET_KEY) ?? "";
}

/** Only show in dev builds (Settings → Developer tab). Settings-as-icon toggle, Stripe Live/Test + dev tier switch. */
export function DevOptionsSection() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { settingsAsIcon, setSettingsAsIcon } = useContext(SettingsNavContext);
  const { developerMenuEnabled, setDeveloperMenuEnabled } = useContext(DeveloperMenuContext);
  const [canUseDevOverride, setCanUseDevOverride] = useState(false);
  const [stripeTestMode, setStripeTestMode] = useState(false);
  const [stripeModeLoading, setStripeModeLoading] = useState(false);
  const [devSecret, setDevSecret] = useState("");
  const [devTierLoading, setDevTierLoading] = useState<string | null>(null);
  const [devTierError, setDevTierError] = useState<string | null>(null);
  const [storageSimulateFull, setStorageSimulateFull] = useState(getDevStorageSimulateFull);
  const [usageUnlimited, setUsageUnlimited] = useState(getDevUsageUnlimited);

  const hasStoredSecret = getStoredSecret().length > 0;
  const effectiveSecret = devSecret.trim() || getStoredSecret();

  useEffect(() => {
    if (!user?.token) return;
    api.getDevCanUseOverride(user.token).then((r) => setCanUseDevOverride(r.allowed)).catch(() => setCanUseDevOverride(false));
    api.getDevStripeMode(user.token).then((r) => setStripeTestMode(r.useTestMode)).catch(() => setStripeTestMode(false));
  }, [user?.token]);

  useEffect(() => {
    setDevSecret(getStoredSecret());
  }, []);

  useEffect(() => {
    const onOverride = () => {
      setStorageSimulateFull(getDevStorageSimulateFull());
      setUsageUnlimited(getDevUsageUnlimited());
    };
    window.addEventListener("ihostmc-dev-overrides-change", onOverride);
    return () => window.removeEventListener("ihostmc-dev-overrides-change", onOverride);
  }, []);

  const handleStripeModeToggle = useCallback(async () => {
    if (!user?.token) return;
    setStripeModeLoading(true);
    try {
      const next = !stripeTestMode;
      await api.setDevStripeMode(user.token, next);
      setStripeTestMode(next);
      toast.info(next ? t("settings.dev.stripeTestOn") : t("settings.dev.stripeLiveOn"));
    } catch {
      toast.error(t("settings.dev.stripeModeFailed"));
    } finally {
      setStripeModeLoading(false);
    }
  }, [user?.token, stripeTestMode, t]);

  const handleSetDevTier = useCallback(
    async (tierId: "free" | "backup" | "pro") => {
      if (!user?.token) return;
      if (!effectiveSecret) {
        setDevTierError(t("settings.dev.enterSecret"));
        return;
      }
      setDevTierError(null);
      setDevTierLoading(tierId);
      try {
        await api.setDevTier(user.token, effectiveSecret, tierId);
        const status = await api.getSubscriptionStatus(user.token);
        toast.success(t("settings.dev.tierSet", { tier: status.tier?.name ?? tierId }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : t("settings.dev.tierSetFailed");
        setDevTierError(msg);
        toast.error(msg);
      } finally {
        setDevTierLoading(null);
      }
    },
    [user?.token, effectiveSecret, t]
  );

  const saveSecret = useCallback(() => {
    const s = devSecret.trim();
    if (s) {
      localStorage.setItem(DEV_TIER_SECRET_KEY, s);
      toast.success(t("settings.dev.secretSaved"));
    }
  }, [devSecret, t]);

  const clearSecret = useCallback(() => {
    setDevSecret("");
    localStorage.removeItem(DEV_TIER_SECRET_KEY);
    setDevTierError(null);
    toast.info(t("settings.dev.secretCleared"));
  }, [t]);

  const handleSettingsAsIconToggle = useCallback(() => {
    const next = !settingsAsIcon;
    setSettingsAsIcon(next);
    toast.info(next ? t("settings.dev.settingsAsIconOn") : t("settings.dev.settingsAsIconOff"));
  }, [settingsAsIcon, setSettingsAsIcon, t]);

  return (
    <div className="min-h-full space-y-6">
      <div className="min-h-full rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 p-6 space-y-6">
        <p className="text-xs text-muted-foreground">
          {t("settings.dev.intro")}
        </p>

        {/* Show Developer / Debug menu – for all users */}
        <div>
          <h4 className="text-base font-semibold text-foreground mb-1">
            {t("settings.dev.showDeveloperMenu", { defaultValue: "Show Developer menu" })}
          </h4>
          <p className="text-sm text-muted-foreground mb-3">
            {t("settings.dev.showDeveloperMenuDesc", {
              defaultValue: "When on, the Developer menu appears in the app menu (☰) and under Help. Use it to open the Dev tools panel, refresh, or open the Developer page.",
            })}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={developerMenuEnabled}
              onClick={() => {
                const next = !developerMenuEnabled;
                setDeveloperMenuEnabled(next);
                toast.info(next ? t("settings.dev.developerMenuOn", { defaultValue: "Developer menu enabled" }) : t("settings.dev.developerMenuOff", { defaultValue: "Developer menu disabled" }));
              }}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                developerMenuEnabled ? "bg-primary" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-primary-foreground shadow ring-0 transition",
                  developerMenuEnabled ? "translate-x-5" : "translate-x-1"
                )}
              />
            </button>
            <span className="text-sm font-medium">
              {developerMenuEnabled ? t("common.on", { defaultValue: "On" }) : t("common.off", { defaultValue: "Off" })}
            </span>
          </div>
        </div>

        {/* Settings as icon – only with override */}
        {canUseDevOverride && (
          <div>
            <h4 className="text-base font-semibold text-foreground mb-1">{t("settings.dev.settingsAsIcon", { defaultValue: "Settings as icon (right side of navbar)" })}</h4>
            <p className="text-sm text-muted-foreground mb-3">{t("settings.dev.settingsAsIconDesc", { defaultValue: "When on, Settings appears as a gear icon on the right of the top bar instead of a tab. When off, Settings is a tab in the main nav." })}</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={settingsAsIcon}
                onClick={handleSettingsAsIconToggle}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                  settingsAsIcon ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-primary-foreground shadow ring-0 transition",
                    settingsAsIcon ? "translate-x-5" : "translate-x-1"
                  )}
                />
              </button>
              <span className="text-sm font-medium">{settingsAsIcon ? t("common.on", { defaultValue: "On" }) : t("common.off", { defaultValue: "Off" })}</span>
            </div>
          </div>
        )}

        {/* Stripe Live / Test – only with override */}
        {canUseDevOverride && (
        <div>
          <h4 className="text-base font-semibold text-foreground mb-1">{t("settings.dev.stripeMode")}</h4>
          <p className="text-sm text-muted-foreground mb-3">{t("settings.dev.stripeModeDesc")}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={stripeTestMode}
              onClick={handleStripeModeToggle}
              disabled={stripeModeLoading}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50",
                stripeTestMode ? "bg-amber-500" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition",
                  stripeTestMode ? "translate-x-5" : "translate-x-1"
                )}
              />
            </button>
            <span className="text-sm font-medium">
              {stripeTestMode ? t("settings.dev.stripeTest") : t("settings.dev.stripeLive")}
            </span>
            {stripeModeLoading && <span className="text-xs text-muted-foreground">…</span>}
          </div>
        </div>
        )}

        {/* Dev tier override – only with override */}
        {canUseDevOverride && (
          <div>
            <h4 className="text-base font-semibold text-foreground mb-1">{t("settings.dev.switchTier")}</h4>
            <p className="text-sm text-muted-foreground mb-4">{t("settings.dev.switchTierDesc")}</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs font-medium text-muted-foreground block mb-1">{t("settings.dev.devTierSecret")}</label>
                <input
                  type="password"
                  value={devSecret}
                  onChange={(e) => { setDevSecret(e.target.value); setDevTierError(null); }}
                  placeholder={t("settings.dev.devTierSecretPlaceholder")}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={saveSecret} disabled={!devSecret.trim()}>
                  {t("settings.dev.saveSecret")}
                </Button>
                {hasStoredSecret && (
                  <Button variant="ghost" size="sm" onClick={clearSecret}>
                    {t("settings.dev.clearSecret")}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {(["free", "backup", "pro"] as const).map((tierId) => (
                <Button
                  key={tierId}
                  variant="outline"
                  size="sm"
                  disabled={devTierLoading !== null}
                  onClick={() => handleSetDevTier(tierId)}
                >
                  {devTierLoading === tierId ? "…" : tierId.charAt(0).toUpperCase() + tierId.slice(1)}
                </Button>
              ))}
            </div>
            {devTierError && <p className="text-sm text-destructive mt-2">{devTierError}</p>}
          </div>
        )}

        {!user && (
          <p className="text-sm text-muted-foreground">{t("settings.dev.signInRequired")}</p>
        )}
        {user && !canUseDevOverride && (
          <p className="text-sm text-muted-foreground">{t("settings.dev.overrideNotAllowed")}</p>
        )}

        {/* Simulate storage almost full – only with override */}
        {canUseDevOverride && (
          <div>
            <h4 className="text-base font-semibold text-foreground mb-1">
              {t("settings.dev.simulateStorageFull")}
            </h4>
            <p className="text-sm text-muted-foreground mb-3">
              {t("settings.dev.simulateStorageFullDesc")}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={storageSimulateFull}
                onClick={() => {
                  const next = !storageSimulateFull;
                  setDevStorageSimulateFull(next);
                  setStorageSimulateFull(next);
                  toast.info(next ? t("settings.dev.simulateStorageOn") : t("settings.dev.simulateStorageOff"));
                }}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                  storageSimulateFull ? "bg-amber-500" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition",
                    storageSimulateFull ? "translate-x-5" : "translate-x-1"
                  )}
                />
              </button>
              <span className="text-sm font-medium">
                {storageSimulateFull ? t("common.on", { defaultValue: "On" }) : t("common.off", { defaultValue: "Off" })}
              </span>
            </div>
          </div>
        )}

        {/* Unlimited usage – only with override */}
        {canUseDevOverride && (
          <div>
            <h4 className="text-base font-semibold text-foreground mb-1">
              {t("settings.dev.unlimitedUsage")}
            </h4>
            <p className="text-sm text-muted-foreground mb-3">
              {t("settings.dev.unlimitedUsageDesc")}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={usageUnlimited}
                onClick={() => {
                  const next = !usageUnlimited;
                  setDevUsageUnlimited(next);
                  setUsageUnlimited(next);
                  toast.info(next ? t("settings.dev.unlimitedUsageOn") : t("settings.dev.unlimitedUsageOff"));
                }}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                  usageUnlimited ? "bg-amber-500" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition",
                    usageUnlimited ? "translate-x-5" : "translate-x-1"
                  )}
                />
              </button>
              <span className="text-sm font-medium">
                {usageUnlimited ? t("common.on", { defaultValue: "On" }) : t("common.off", { defaultValue: "Off" })}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
