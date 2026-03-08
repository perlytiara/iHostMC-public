"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { getPath, type Locale } from "@/i18n/pathnames";
import { useLocale } from "next-intl";
import { getApiBaseUrl, getStoredToken, clearStoredAuth, responseJson } from "@/lib/api";
import { DashboardLoadingBlock } from "@/components/DashboardLoadingBlock";
import { RefreshCw, ShieldAlert, Search, Users } from "lucide-react";
import { SafeIcon } from "@/components/SafeIcon";
import { Button } from "@/components/ui/button";

interface UsageUser {
  userId: string;
  email: string;
  used: number;
  limit: number;
  tierId: string;
  simulateAtLimit: boolean;
}

interface Overview {
  since: string;
  periodStart: string;
  totalRequests: number;
  users: UsageUser[];
}

interface ManagedUser {
  userId: string;
  email: string;
  username: string | null;
  tierId: string;
}

const TIER_IDS = ["free", "backup", "pro"] as const;

export default function DashboardAdminPage() {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchBy, setUserSearchBy] = useState<"email" | "username">("email");
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userSearchError, setUserSearchError] = useState<string | null>(null);
  const [settingTierUserId, setSettingTierUserId] = useState<string | null>(null);
  const [removingTierUserId, setRemovingTierUserId] = useState<string | null>(null);

  function fetchOverview() {
    const token = getStoredToken();
    if (!token) {
      router.replace(getPath("login", locale));
      return;
    }
    const base = getApiBaseUrl();
    if (!base) {
      setError("API not configured");
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    fetch(`${base}/api/admin/usage/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) {
          clearStoredAuth();
          router.replace(getPath("login", locale));
          return null;
        }
        if (r.status === 403) {
          setError("Admin access required");
          return null;
        }
        if (!r.ok) throw new Error("Failed to load");
        return responseJson(r, null as unknown as Overview);
      })
      .then((data) => {
        if (data) setOverview(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load usage overview");
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchOverview();
  }, [locale]);

  async function toggleSimulate(userId: string, simulate: boolean) {
    const token = getStoredToken();
    const base = getApiBaseUrl();
    if (!token || !base) return;
    setTogglingUserId(userId);
    try {
      const r = await fetch(`${base}/api/admin/usage/simulate-limit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, simulate }),
      });
      if (r.status === 401) {
        clearStoredAuth();
        router.replace(getPath("login", locale));
        return;
      }
      if (!r.ok) throw new Error("Request failed");
      setOverview((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((u) =>
                u.userId === userId ? { ...u, simulateAtLimit: simulate } : u
              ),
            }
          : null
      );
    } catch {
      setError("Failed to update simulate limit");
    } finally {
      setTogglingUserId(null);
    }
  }

  async function searchUsers() {
    const token = getStoredToken();
    const base = getApiBaseUrl();
    if (!token || !base) return;
    const q = userSearchQuery.trim();
    setUserSearchError(null);
    setUserSearchLoading(true);
    try {
      const params = q ? new URLSearchParams({ [userSearchBy]: q }) : "";
      const r = await fetch(`${base}/api/admin/users${params ? `?${params}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) {
        clearStoredAuth();
        router.replace(getPath("login", locale));
        return;
      }
      if (r.status === 403) {
        setUserSearchError("Admin access required");
        return;
      }
      if (!r.ok) throw new Error("Failed to load");
      const data = await responseJson(r, { users: [] });
      setManagedUsers(data.users ?? []);
    } catch {
      setUserSearchError("Failed to load users");
      setManagedUsers([]);
    } finally {
      setUserSearchLoading(false);
    }
  }

  async function setUserTier(userId: string, tierId: string) {
    const token = getStoredToken();
    const base = getApiBaseUrl();
    if (!token || !base) return;
    setSettingTierUserId(userId);
    try {
      const r = await fetch(`${base}/api/admin/users/set-tier`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, tierId }),
      });
      if (r.status === 401) {
        clearStoredAuth();
        router.replace(getPath("login", locale));
        return;
      }
      if (!r.ok) {
        const err = await responseJson(r, { error: "Failed to set tier" });
        setUserSearchError(err?.error ?? "Failed to set tier");
        return;
      }
      setManagedUsers((prev) =>
        prev.map((u) => (u.userId === userId ? { ...u, tierId } : u))
      );
    } catch {
      setUserSearchError("Failed to set tier");
    } finally {
      setSettingTierUserId(null);
    }
  }

  async function removeUserTierOverride(userId: string) {
    const token = getStoredToken();
    const base = getApiBaseUrl();
    if (!token || !base) return;
    setRemovingTierUserId(userId);
    try {
      const r = await fetch(`${base}/api/admin/users/${userId}/tier`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) {
        clearStoredAuth();
        router.replace(getPath("login", locale));
        return;
      }
      if (r.status === 404 || !r.ok) {
        setUserSearchError("No override found or failed to remove");
        return;
      }
      await searchUsers();
    } catch {
      setUserSearchError("Failed to remove tier override");
    } finally {
      setRemovingTierUserId(null);
    }
  }

  if (loading) return <DashboardLoadingBlock />;

  if (error && !overview) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-destructive">
          <SafeIcon><ShieldAlert className="h-5 w-5" /></SafeIcon>
          <span className="font-medium">{error}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Only accounts listed in DEV_TIER_OVERRIDE_EMAIL on the server can access the admin dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Admin – Usage &amp; limits
        </h1>
        <button
          type="button"
          onClick={() => fetchOverview()}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {overview && (
        <>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Total API requests this period (since {new Date(overview.since).toLocaleDateString()})</p>
            <p className="text-2xl font-bold tabular-nums text-foreground mt-1">{overview.totalRequests}</p>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="font-semibold text-foreground">Users &amp; usage</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Simulate at limit: user will see 402 when recording usage until you turn it off.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-foreground">Email</th>
                    <th className="text-right px-4 py-2.5 font-medium text-foreground">Used</th>
                    <th className="text-right px-4 py-2.5 font-medium text-foreground">Limit</th>
                    <th className="text-left px-4 py-2.5 font-medium text-foreground">Tier</th>
                    <th className="text-left px-4 py-2.5 font-medium text-foreground">Simulate at limit</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.users.map((u) => (
                    <tr key={u.userId} className="border-b border-border/80 hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-foreground">{u.email || u.userId}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{u.used}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{u.limit}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{u.tierId}</td>
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          disabled={togglingUserId === u.userId}
                          onClick={() => toggleSimulate(u.userId, !u.simulateAtLimit)}
                          className={`rounded px-2 py-1 text-xs font-medium ${
                            u.simulateAtLimit
                              ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {togglingUserId === u.userId ? "…" : u.simulateAtLimit ? "On" : "Off"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <SafeIcon><Users className="h-4 w-4" /></SafeIcon>
                User management
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Find users by email or username and set their tier (free, backup, pro). Overrides subscription for testing or early access.
              </p>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={userSearchBy}
                  onChange={(e) => setUserSearchBy(e.target.value as "email" | "username")}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  aria-label="Search by"
                >
                  <option value="email">By email</option>
                  <option value="username">By username</option>
                </select>
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchUsers()}
                  placeholder={userSearchBy === "email" ? "user@example.com" : "username"}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm min-w-[200px]"
                  aria-label="Search query"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => searchUsers()}
                  disabled={userSearchLoading}
                >
                  <SafeIcon><Search className="h-3.5 w-3.5" /></SafeIcon>
                  {userSearchLoading ? "…" : "Find"}
                </Button>
                {!userSearchQuery.trim() && (
                  <span className="text-xs text-muted-foreground">Leave empty to list recent users (up to 500)</span>
                )}
              </div>
              {userSearchError && (
                <p className="text-sm text-destructive">{userSearchError}</p>
              )}
              {managedUsers.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 font-medium text-foreground">Email</th>
                        <th className="text-left px-4 py-2.5 font-medium text-foreground">Username</th>
                        <th className="text-left px-4 py-2.5 font-medium text-foreground">Current tier</th>
                        <th className="text-left px-4 py-2.5 font-medium text-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {managedUsers.map((u) => (
                        <tr key={u.userId} className="border-b border-border/80 hover:bg-muted/20">
                          <td className="px-4 py-2.5 text-foreground">{u.email}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{u.username ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            <span className="rounded bg-muted px-2 py-0.5 font-medium text-foreground">{u.tierId}</span>
                          </td>
                          <td className="px-4 py-2.5 flex flex-wrap items-center gap-2">
                            <select
                              className="rounded border border-border bg-background px-2 py-1 text-xs"
                              value={u.tierId}
                              onChange={(e) => setUserTier(u.userId, e.target.value)}
                              disabled={settingTierUserId === u.userId}
                              aria-label={`Set tier for ${u.email}`}
                            >
                              {TIER_IDS.map((id) => (
                                <option key={id} value={id}>{id}</option>
                              ))}
                            </select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => removeUserTierOverride(u.userId)}
                              disabled={removingTierUserId === u.userId}
                            >
                              {removingTierUserId === u.userId ? "…" : "Remove override"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {managedUsers.length === 0 && !userSearchLoading && (userSearchQuery.trim() || managedUsers.length === 0) && overview && (
                <p className="text-sm text-muted-foreground">Search by email or username, or leave empty and click Find to list recent users.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
