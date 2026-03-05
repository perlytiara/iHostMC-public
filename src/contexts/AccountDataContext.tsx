"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type SubscriptionStatus, type TierInfo } from "@/lib/api-client";

interface UsageSummary {
  used: number;
  limit: number;
  period: string;
  since: string;
  summary?: Record<string, number>;
  summaryByDay?: Record<string, number>;
  aiCreditsBalance?: number;
  aiUsedThisMonth?: number;
  aiCreditsPerMonth?: number;
  tierId?: string;
}

interface AccountDataState {
  tiers: TierInfo[];
  subscription: SubscriptionStatus | null;
  usage: UsageSummary | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const AccountDataContext = createContext<AccountDataState | null>(null);

export function AccountDataProvider({
  children,
  token,
}: {
  children: ReactNode;
  /** When set, preload tiers, subscription, and usage so Settings → Account doesn't jump. */
  token?: string | null;
}) {
  const [tiers, setTiers] = useState<TierInfo[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const t = token ?? undefined;
    if (!t) {
      setSubscription(null);
      setUsage(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [tiersRes, subRes, usageRes] = await Promise.all([
        api.getTiers().catch(() => ({ tiers: [] })),
        api.getSubscriptionStatus(t).catch(() => null),
        api.getUsageSummary(t).catch(() => null),
      ]);
      setTiers(tiersRes.tiers?.length ? tiersRes.tiers : []);
      setSubscription(subRes);
      setUsage(
        usageRes
          ? {
              used: usageRes.used,
              limit: usageRes.limit,
              period: usageRes.period,
              since: usageRes.since,
              summary: usageRes.summary,
              summaryByDay: usageRes.summaryByDay,
              aiCreditsBalance: usageRes.aiCreditsBalance,
              aiUsedThisMonth: usageRes.aiUsedThisMonth,
              aiCreditsPerMonth: usageRes.aiCreditsPerMonth,
              tierId: usageRes.tierId,
            }
          : null
      );
    } catch {
      setSubscription(null);
      setUsage(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return (
    <AccountDataContext.Provider
      value={{
        tiers,
        subscription,
        usage,
        loading,
        refetch,
      }}
    >
      {children}
    </AccountDataContext.Provider>
  );
}

export function useAccountData() {
  const ctx = useContext(AccountDataContext);
  return ctx;
}
