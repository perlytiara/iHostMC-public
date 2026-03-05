"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { User, CreditCard, Server, Sparkles, Cloudy, Check, ExternalLink, Zap } from "lucide-react";
import { cn, isTauri } from "@/lib/utils";
import { api, type TierInfo, type SubscriptionStatus, type WebAuthnCredential } from "@/lib/api-client";
import { getWebsiteUrl, getWebsiteAccountSettingsUrl } from "@/lib/api-client";
import { useAuthStore, AccountConnect } from "@/features/auth";
import { isBackendConfigured } from "@/lib/api-client";
import { toast } from "@/lib/toast-store";
import { useAccountData } from "@/contexts/AccountDataContext";

const BILLING_SETUP_GUIDE_URL = "https://github.com/perlytiara/iHostMC/blob/main/docs/SERVER-BILLING-PROMPT.md";

const TIER_ICONS: Record<string, typeof Server> = {
  free: Server,
  backup: Cloudy,
  pro: Sparkles,
};

/** Fallback when GET /api/tiers fails. Same progressive feature list as backend. Pro = 500 free credits/month. */
const FALLBACK_TIERS: TierInfo[] = [
  { id: "free", name: "Free", priceUsd: 0, maxServers: 999, aiIncluded: false, aiCreditsPerMonth: 0, autoBackup: false, apiRequestsPerMonth: 50, description: "Host servers, mods & plugins, play without port forwarding. Use AI by buying credits.", featureKeys: ["tierFeatureModloader", "tierFeatureModsPlugins", "tierFeatureNoPortForward"] },
  { id: "backup", name: "Backup", priceUsd: 3.99, maxServers: 999, aiIncluded: false, aiCreditsPerMonth: 0, autoBackup: true, apiRequestsPerMonth: 500, description: "Everything in Free plus cloud backup or connect your own (e.g. Google Drive). Use AI by buying credits.", featureKeys: ["tierFeatureModloader", "tierFeatureModsPlugins", "tierFeatureNoPortForward", "tierFeatureBackup"] },
  { id: "pro", name: "Pro", priceUsd: 11.99, maxServers: 999, aiIncluded: true, aiCreditsPerMonth: 500, autoBackup: true, apiRequestsPerMonth: 10000, description: "Everything in Backup plus AI features and 500 free credits/month; buy more anytime.", featureKeys: ["tierFeatureModloader", "tierFeatureModsPlugins", "tierFeatureNoPortForward", "tierFeatureBackup", "tierFeatureAi"] },
];

/** AI credit packs for one-time purchase (any tier). */
const CREDIT_PACKS = [
  { id: "small" as const, nameKey: "settings.creditPackSmall", credits: 250, priceUsd: 3.99 },
  { id: "medium" as const, nameKey: "settings.creditPackMedium", credits: 1000, priceUsd: 10 },
  { id: "bulk" as const, nameKey: "settings.creditPackBulk", credits: 5000, priceUsd: 50 },
];

interface AccountSectionProps {
  compact?: boolean;
  /** Called before logout so the app stays on settings/account and avoids a blank screen */
  onEnsureAccountVisible?: () => void;
}

/** Price display by locale: € for de/fr, $ for en (US) etc. */
function formatPrice(priceUsd: number, locale: string): string {
  if (priceUsd === 0) return "Free";
  const lang = (locale || "en").split("-")[0];
  if (lang === "de" || lang === "fr") return `${priceUsd.toFixed(2)}€`;
  return `$${priceUsd.toFixed(2)}`;
}

/** Build list of days in the same month as since (ISO string), with usage from summaryByDay. */
function getDaysWithUsage(since: string | undefined, summaryByDay: Record<string, number> | undefined): { day: string; units: number }[] {
  if (!since) return [];
  const start = new Date(since);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const out: { day: string; units: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const units = summaryByDay?.[dateStr] ?? 0;
    out.push({ day: dateStr, units });
  }
  return out;
}

function UsageDashboard({
  used,
  summaryByDay,
  since,
  aiCreditsBalance,
  aiUsedThisMonth,
  aiCreditsPerMonth,
  t,
}: {
  used: number;
  summaryByDay?: Record<string, number>;
  since?: string;
  aiCreditsBalance: number;
  aiUsedThisMonth: number;
  aiCreditsPerMonth: number;
  t: (key: string) => string;
}) {
  const daysWithUsage = getDaysWithUsage(since, summaryByDay);
  const maxUnits = Math.max(1, ...daysWithUsage.map((d) => d.units));
  const remainingCredits =
    aiCreditsBalance + (aiCreditsPerMonth > 0 ? Math.max(0, aiCreditsPerMonth - aiUsedThisMonth) : 0);

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("settings.usageDashboard")}</p>
          <p className="text-lg font-semibold text-foreground mt-0.5">
            {t("settings.requestsThisMonthLabel")} <span className="text-primary">{used}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("settings.remainingCredits")}</p>
          <p className="text-lg font-semibold text-primary mt-0.5">{remainingCredits}</p>
        </div>
      </div>
      {daysWithUsage.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{t("settings.usageByDay")}</p>
          <div className="flex items-end gap-0.5 h-12" aria-hidden>
            {daysWithUsage.map(({ day, units }) => (
              <div
                key={day}
                className="flex-1 min-w-0 rounded-t bg-primary/20 hover:bg-primary/30 transition-colors"
                style={{ height: `${Math.max(4, (units / maxUnits) * 100)}%` }}
                title={`${day}: ${units}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AccountSection({ compact, onEnsureAccountVisible }: AccountSectionProps) {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const accountData = useAccountData();
  const [tiers, setTiers] = useState<TierInfo[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [usageUsed, setUsageUsed] = useState<number | null>(null);
  const [usageLimit, setUsageLimit] = useState<number | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [creditPackLoading, setCreditPackLoading] = useState<"small" | "medium" | "bulk" | null>(null);
  const [profile, setProfile] = useState<{ displayName: string; username: string }>({ displayName: "", username: "" });
  const [_profileSaving, setProfileSaving] = useState(false);
  const [_profileError, setProfileError] = useState("");
  const [_passkeys, setPasskeys] = useState<WebAuthnCredential[]>([]);
  const [_passkeyLoading, setPasskeyLoading] = useState(false);
  const [_passkeyDeleting, setPasskeyDeleting] = useState<string | null>(null);
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNew, setPasswordNew] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [_passwordSaving, setPasswordSaving] = useState(false);
  const [_passwordError, setPasswordError] = useState("");

  const loadMe = useCallback(async () => {
    if (!user?.token) return;
    try {
      const me = await api.me(user.token);
      setProfile({
        displayName: me.displayName ?? "",
        username: me.username ?? "",
      });
    } catch {
      setProfile({ displayName: "", username: "" });
    }
  }, [user?.token]);

  const loadPasskeys = useCallback(async () => {
    if (!user?.token) return;
    try {
      const list = await api.getWebAuthnCredentials(user.token);
      setPasskeys(list);
    } catch {
      setPasskeys([]);
    }
  }, [user?.token]);

  const loadTiers = useCallback(async () => {
    try {
      const { tiers: list } = await api.getTiers();
      setTiers(list?.length ? list : FALLBACK_TIERS);
    } catch {
      setTiers(FALLBACK_TIERS);
    }
  }, []);

  const loadSubscription = useCallback(async () => {
    if (!user?.token) return;
    try {
      const status = await api.getSubscriptionStatus(user.token);
      setSubscription(status);
    } catch {
      setSubscription(null);
    }
  }, [user?.token]);

  const loadUsage = useCallback(async () => {
    if (!user?.token) return;
    try {
      const r = await api.getUsageSummary(user.token);
      setUsageUsed(r.used);
      setUsageLimit(r.limit);
    } catch {
      setUsageUsed(null);
      setUsageLimit(null);
    }
  }, [user?.token]);

  useEffect(() => {
    loadTiers();
  }, [loadTiers]);

  useEffect(() => {
    if (user) {
      loadSubscription();
      loadUsage();
      loadMe();
      loadPasskeys();
    } else {
      setSubscription(null);
      setUsageUsed(null);
      setProfile({ displayName: "", username: "" });
      setPasskeys([]);
    }
  }, [user, loadSubscription, loadUsage, loadMe, loadPasskeys]);

  // When checkout popup sends result, refetch so UI updates without reload
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e?.data;
      if (data?.type === "ihostmc-checkout" && (data?.checkout === "success" || data?.checkout === "cancel")) {
        accountData?.refetch();
        loadSubscription();
        loadUsage();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [accountData, loadSubscription, loadUsage]);

  // Refetch when window regains focus
  useEffect(() => {
    const onFocus = () => {
      if (user) {
        accountData?.refetch();
        loadSubscription();
        loadUsage();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user, accountData, loadSubscription, loadUsage]);

  const openExternalUrl = useCallback(async (url: string) => {
    if (!url) return;
    try {
      if (isTauri()) {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const handleManageBilling = useCallback(async () => {
    if (!user) return;
    setBillingLoading(true);
    try {
      const { url } = await api.createCustomerPortalSession(user.token);
      if (url) await openExternalUrl(url);
      else toast.error(t("settings.billingNoUrl"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("settings.billingError"));
    } finally {
      setBillingLoading(false);
    }
  }, [user, openExternalUrl, t]);

  const handleSelectTier = useCallback(
    async (tierId: string) => {
      if (!user || tierId === "free") return;
      const websiteUrl = getWebsiteUrl();
      const successUrl = websiteUrl ? `${websiteUrl}/checkout/return?checkout=success` : undefined;
      const cancelUrl = websiteUrl ? `${websiteUrl}/checkout/return?checkout=cancel` : undefined;
      setCheckoutLoading(tierId);
      try {
        const { url } = await api.createCheckoutSession(user.token, {
          tierId,
          successUrl,
          cancelUrl,
        });
        if (url) await openExternalUrl(url);
        else toast.error(t("settings.checkoutNoUrl"));
      } catch (e) {
        const msg = e instanceof Error ? e.message : t("settings.checkoutError");
        const isNoPrice = typeof msg === "string" && (msg.includes("No price available") || msg.includes("Stripe Price IDs"));
        toast.error(isNoPrice ? t("settings.checkoutNoPriceHint") : msg);
      } finally {
        setCheckoutLoading(null);
      }
    },
    [user, openExternalUrl, t]
  );

  const _handleSaveProfile = useCallback(async () => {
    if (!user?.token) return;
    setProfileSaving(true);
    setProfileError("");
    try {
      const displayNameVal = profile.displayName.trim() || null;
      const usernameVal = profile.username.trim()
        ? profile.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "")
        : null;
      if (usernameVal !== null && usernameVal.length > 0 && usernameVal.length < 2) {
        setProfileError("Username must be at least 2 characters (letters, numbers, _, -)");
        setProfileSaving(false);
        return;
      }
      await api.updateMe(user.token, { displayName: displayNameVal, username: usernameVal });
      toast.success(t("settings.profileSaved") ?? "Profile saved");
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setProfileSaving(false);
    }
  }, [user?.token, profile.displayName, profile.username, t]);

  const _handleChangePassword = useCallback(async () => {
    if (!user?.token) return;
    if (passwordNew !== passwordConfirm) {
      setPasswordError("New passwords do not match");
      return;
    }
    if (passwordNew.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }
    setPasswordSaving(true);
    setPasswordError("");
    try {
      await api.changePassword(user.token, passwordCurrent, passwordNew);
      toast.success(t("settings.passwordChanged") ?? "Password changed");
      setPasswordCurrent("");
      setPasswordNew("");
      setPasswordConfirm("");
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setPasswordSaving(false);
    }
  }, [user?.token, passwordCurrent, passwordNew, passwordConfirm, t]);

  const _handleAddPasskey = useCallback(async () => {
    if (!user?.token) return;
    setPasskeyLoading(true);
    try {
      const options = await api.getWebAuthnRegisterOptions(user.token);
      const { startRegistration } = await import("@simplewebauthn/browser");
      const cred = await startRegistration({
        optionsJSON: options as unknown as Parameters<typeof startRegistration>[0]["optionsJSON"],
      });
      await api.verifyWebAuthnRegister(user.token, cred);
      toast.success("Passkey added");
      loadPasskeys();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to add passkey";
      toast.error(msg);
    } finally {
      setPasskeyLoading(false);
    }
  }, [user?.token, loadPasskeys]);

  const _handleDeletePasskey = useCallback(
    async (id: string) => {
      if (!user?.token) return;
      setPasskeyDeleting(id);
      try {
        await api.deleteWebAuthnCredential(user.token, id);
        toast.success("Passkey removed");
        setPasskeys((prev) => prev.filter((p) => p.id !== id));
      } catch {
        toast.error("Failed to remove passkey");
      } finally {
        setPasskeyDeleting(null);
      }
    },
    [user?.token]
  );

  const handleBuyCredits = useCallback(
    async (packId: "small" | "medium" | "bulk") => {
      if (!user?.token) return;
      const websiteUrl = getWebsiteUrl();
      const successUrl = websiteUrl ? `${websiteUrl}/checkout/return?checkout=success` : undefined;
      const cancelUrl = websiteUrl ? `${websiteUrl}/checkout/return?checkout=cancel` : undefined;
      setCreditPackLoading(packId);
      try {
        const { url } = await api.createCreditCheckoutSession(user.token, {
          packId,
          successUrl,
          cancelUrl,
        });
        if (url) await openExternalUrl(url);
        else toast.error(t("settings.checkoutNoUrl"));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("Credit packs") || msg.includes("501")) {
          if (websiteUrl) await openExternalUrl(`${websiteUrl.replace(/\/$/, "")}/credits`);
          else toast.info(t("settings.creditPacksComingSoon"));
        } else {
          toast.error(msg || t("settings.checkoutError"));
        }
      } finally {
        setCreditPackLoading(null);
      }
    },
    [user?.token, openExternalUrl, t]
  );

  if (!isBackendConfigured()) {
    return (
      <div className={cn("rounded-xl border border-border bg-card/50 p-6 text-center", compact && "p-4")}>
        <p className="text-sm text-muted-foreground">{t("settings.backendNotConfigured")}</p>
      </div>
    );
  }

  if (!user) {
    return <AccountConnect compact={compact} onBeforeLogin={onEnsureAccountVisible} />;
  }

  const displayTiers = (accountData?.tiers?.length ? accountData.tiers : tiers.length ? tiers : FALLBACK_TIERS);
  const displaySubscription = accountData?.subscription ?? subscription;
  const displayUsageUsed = accountData?.usage?.used ?? usageUsed;
  const _displayUsageLimit = accountData?.usage?.limit ?? usageLimit;
  const _accountLoading = accountData?.loading ?? false;

  const currentTierId = displaySubscription?.tierId ?? "free";
  const currentTier = displaySubscription?.tier ?? displayTiers.find((t) => t.id === "free");
  const periodEnd = displaySubscription?.currentPeriodEnd
    ? new Date(displaySubscription.currentPeriodEnd).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
  const endsAtPeriodEnd = displaySubscription?.endsAtPeriodEnd ?? false;

  void [_handleSaveProfile, _handleChangePassword, _handleAddPasskey, _handleDeletePasskey, _displayUsageLimit, _accountLoading];

  return (
    <div className="space-y-8">
      {/* 1. Account / sign-in at top: who you are, sign out, manage billing. Min-height avoids layout shift when preload finishes. */}
      <div className="rounded-2xl border-2 border-border bg-card/50 overflow-hidden min-h-[200px]">
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("settings.signedInAs")}</p>
                <p className="font-semibold text-foreground">{user.email}</p>
                {currentTier && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {t("settings.currentPlan")}: <span className="font-medium text-foreground">{currentTier.name}</span>
                    {currentTier.priceUsd > 0 && periodEnd && (
                      <span className="ml-1">
                        · {endsAtPeriodEnd ? (currentTierId === "pro" ? t("settings.proUntil") : t("settings.paidUntil")) : t("settings.renewsOn")} {periodEnd}
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onEnsureAccountVisible?.();
                  setTimeout(() => logout(), 0);
                }}
              >
                {t("settings.signOut")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={billingLoading}
                onClick={handleManageBilling}
                className="gap-2"
              >
                <CreditCard className="h-4 w-4" />
                {billingLoading ? "…" : t("settings.manageBilling")}
              </Button>
            </div>
          </div>
          {/* Usage & credits dashboard: requests this month (no limit), graph, remaining credits */}
          {(accountData?.usage != null || usageUsed != null) && (
            <UsageDashboard
              used={displayUsageUsed ?? 0}
              summaryByDay={accountData?.usage?.summaryByDay}
              since={accountData?.usage?.since}
              aiCreditsBalance={accountData?.usage?.aiCreditsBalance ?? 0}
              aiUsedThisMonth={accountData?.usage?.aiUsedThisMonth ?? 0}
              aiCreditsPerMonth={currentTierId === "pro" ? (currentTier?.aiCreditsPerMonth ?? 0) : 0}
              t={t}
            />
          )}
        </div>
      </div>

      {/* Plan selection – pick one and subscribe */}
      <div className="rounded-2xl border-2 border-border bg-card/50 p-6">
        <h4 className="text-base font-semibold text-foreground mb-1">{t("settings.choosePlan")}</h4>
        <p className="text-sm text-muted-foreground mb-2">Select a plan and subscribe. You can change or cancel anytime from Manage billing.</p>
        <p className="text-xs text-muted-foreground mb-6">
          {t("settings.billingSetupHint")}{" "}
          <button
            type="button"
            onClick={() => openExternalUrl(BILLING_SETUP_GUIDE_URL)}
            className="underline font-medium text-primary hover:opacity-80"
          >
            {t("settings.viewSetupGuide")}
          </button>
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {displayTiers.map((tier) => {
            const Icon = TIER_ICONS[tier.id] ?? Server;
            const isCurrent = currentTierId === tier.id;
            const isPaid = tier.priceUsd > 0;
            const canSubscribe = isPaid && !isCurrent;
            return (
              <div
                key={tier.id}
                className={cn(
                  "relative flex flex-col rounded-xl border-2 bg-background overflow-hidden transition-all min-h-[200px]",
                  isCurrent ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-muted-foreground/50"
                )}
              >
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <h5 className="font-semibold text-foreground">{tier.name}</h5>
                  </div>
                  <p className="text-lg font-bold text-foreground">
                    {tier.priceUsd === 0 ? "Free" : formatPrice(tier.priceUsd, i18n.language)}
                    {tier.priceUsd > 0 && <span className="text-xs font-normal text-muted-foreground">{t("settings.perMonth")}</span>}
                  </p>
                  <ul className="mt-3 space-y-1 flex-1">
                    {tier.featureKeys.map((key) => (
                      <li key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                        {t(`settings.${key}`)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="p-4 pt-0">
                  {isCurrent && (
                    <div className="flex items-center justify-center gap-1.5 rounded-lg bg-primary/15 text-primary py-2 text-sm font-medium">
                      <Check className="h-4 w-4" />
                      {t("settings.currentPlan")}
                    </div>
                  )}
                  {canSubscribe && (
                    <Button
                      className="w-full rounded-lg font-medium"
                      size="sm"
                      disabled={checkoutLoading !== null}
                      onClick={() => handleSelectTier(tier.id)}
                    >
                      {checkoutLoading === tier.id ? "…" : `Subscribe – ${formatPrice(tier.priceUsd, i18n.language)}${t("settings.perMonth")}`}
                    </Button>
                  )}
                  {isCurrent && isPaid && (
                    <Button variant="outline" className="w-full rounded-lg" size="sm" onClick={handleManageBilling}>
                      {t("settings.manageCard")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Buy AI credits – below plans, any tier can purchase packs */}
      <div className="rounded-2xl border-2 border-border bg-card/50 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-5 w-5 text-primary" />
            <h4 className="text-base font-semibold text-foreground">{t("settings.buyCredits")}</h4>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {currentTierId === "pro"
              ? t("settings.buyCreditsProDesc")
              : t("settings.buyCreditsFreeDesc")}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {CREDIT_PACKS.map((pack) => (
              <div
                key={pack.id}
                className={cn(
                  "relative flex flex-col rounded-xl border-2 bg-background overflow-hidden transition-all",
                  "border-border hover:border-primary/50"
                )}
              >
                <div className="p-4 flex flex-col flex-1">
                  <p className="font-semibold text-foreground">{t(pack.nameKey)}</p>
                  <p className="text-lg font-bold text-primary mt-1">
                    {pack.credits} {t("settings.credits")}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {formatPrice(pack.priceUsd, i18n.language)}
                  </p>
                </div>
                <div className="p-4 pt-0">
                  <Button
                    className="w-full rounded-lg font-medium"
                    size="sm"
                    variant="outline"
                    disabled={creditPackLoading !== null}
                    onClick={() => handleBuyCredits(pack.id)}
                  >
                    {creditPackLoading === pack.id ? "…" : t("settings.buyCreditsButton")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t("settings.buyCreditsHint")}</p>
        </div>
      </div>

      {/* Profile & security on website — when you need it, not "manage constantly" */}
      <div className="rounded-2xl border-2 border-border bg-card/50 overflow-hidden">
        <div className="p-6">
          <h4 className="text-base font-semibold text-foreground">{t("settings.otherAccountSettings")}</h4>
          <p className="text-sm text-muted-foreground mt-1">{t("settings.accountSettingsOnWebShort", "Edit profile, passkeys, and password on the website when needed.")}</p>
          {getWebsiteAccountSettingsUrl() ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 gap-2"
              onClick={() => openExternalUrl(getWebsiteAccountSettingsUrl())}
            >
              <ExternalLink className="h-4 w-4" />
              {t("settings.openAccountSettingsOnWeb")}
            </Button>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">{t("settings.websiteUrlNotSet")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
