"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { getPath, type Locale } from "@/i18n/pathnames";
import { useLocale } from "next-intl";
import { getApiBaseUrl, getStoredToken, clearStoredAuth, responseJson } from "@/lib/api";
import { DashboardLoadingBlock } from "@/components/DashboardLoadingBlock";
import { RefreshCw, ShieldAlert, Search, Users, ShieldPlus, ShieldX, Server, Trash2, RotateCcw } from "lucide-react";
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

interface AdminUser {
  userId: string;
  email: string;
  addedBy: string;
  addedByEmail: string;
  createdAt: string;
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

  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminsError, setAdminsError] = useState<string | null>(null);
  const [addAdminEmail, setAddAdminEmail] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [removingAdminUserId, setRemovingAdminUserId] = useState<string | null>(null);
  const [makingAdminUserId, setMakingAdminUserId] = useState<string | null>(null);
  const [adminSuccessMessage, setAdminSuccessMessage] = useState<string | null>(null);

  const [adminServers, setAdminServers] = useState<{ id: string; hostId: string; name: string; userId: string; userEmail: string; trashedAt: string | null; createdAt: string; updatedAt: string; backupCount: number }[]>([]);
  const [adminServersLoading, setAdminServersLoading] = useState(false);
  const [adminServersFilter, setAdminServersFilter] = useState<"active" | "trash">("active");
  const [adminServersUserId, setAdminServersUserId] = useState("");
  const [adminServerActionId, setAdminServerActionId] = useState<string | null>(null);

  const base = getApiBaseUrl();
  const adminUserIds = new Set(admins.map((a) => a.userId));
  const api = (path: string) => (base ? `${base}${path}` : path);

  function fetchOverview() {
    const token = getStoredToken();
    if (!token) {
      router.replace(getPath("login", locale));
      return;
    }
    setError(null);
    setLoading(true);
    fetch(api("/api/admin/usage/overview"), {
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

  function fetchAdmins() {
    const token = getStoredToken();
    if (!token) return;
    setAdminsError(null);
    setAdminsLoading(true);
    fetch(api("/api/admin/admins"), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) {
          clearStoredAuth();
          router.replace(getPath("login", locale));
          return null;
        }
        if (r.status === 403) {
          setAdminsError("Admin access required");
          return null;
        }
        if (!r.ok) throw new Error("Failed to load");
        return responseJson(r, { admins: [] } as { admins: AdminUser[] });
      })
      .then((data) => {
        if (data) setAdmins(data.admins ?? []);
      })
      .catch(() => {
        setAdminsError("Failed to load admins");
        setAdmins([]);
      })
      .finally(() => setAdminsLoading(false));
  }

  useEffect(() => {
    if (overview && !error) fetchAdmins();
  }, [overview, error, locale]);

  useEffect(() => {
    if (overview && !error) fetchAdminServers();
  }, [overview, error, adminServersFilter, adminServersUserId, locale]);

  async function addAdminByEmail() {
    const token = getStoredToken();
    if (!token || !addAdminEmail.trim()) return;
    setAddingAdmin(true);
    setAdminsError(null);
    setAdminSuccessMessage(null);
    try {
      const r = await fetch(api("/api/admin/admins"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: addAdminEmail.trim() }),
      });
      if (r.status === 401) {
        clearStoredAuth();
        router.replace(getPath("login", locale));
        return;
      }
      const data = await responseJson(r, { ok: false, email: "", userId: "" });
      if (!r.ok) {
        setAdminsError((data as { error?: string }).error ?? "Failed to add admin");
        return;
      }
      const addedEmail = (data as { email?: string }).email ?? addAdminEmail.trim();
      setAddAdminEmail("");
      setAdminSuccessMessage(`${addedEmail} added as admin.`);
      setTimeout(() => setAdminSuccessMessage(null), 5000);
      fetchAdmins();
    } catch {
      setAdminsError("Failed to add admin");
    } finally {
      setAddingAdmin(false);
    }
  }

  async function addAdminByUserId(userId: string) {
    const token = getStoredToken();
    if (!token) return;
    setMakingAdminUserId(userId);
    setAdminsError(null);
    setAdminSuccessMessage(null);
    try {
      const r = await fetch(api("/api/admin/admins"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      });
      if (r.status === 401) {
        clearStoredAuth();
        router.replace(getPath("login", locale));
        return;
      }
      const data = await responseJson(r, { ok: false, email: "", userId: "" });
      if (!r.ok) {
        setAdminsError((data as { error?: string }).error ?? "Failed to add admin");
        return;
      }
      const addedEmail = (data as { email?: string }).email ?? "User";
      setAdminSuccessMessage(`${addedEmail} added as admin.`);
      setTimeout(() => setAdminSuccessMessage(null), 5000);
      fetchAdmins();
    } catch {
      setAdminsError("Failed to add admin");
    } finally {
      setMakingAdminUserId(null);
    }
  }

  async function removeAdmin(userId: string) {
    const token = getStoredToken();
    if (!token) return;
    setRemovingAdminUserId(userId);
    setAdminsError(null);
    try {
      const r = await fetch(api(`/api/admin/admins/${userId}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) {
        clearStoredAuth();
        router.replace(getPath("login", locale));
        return;
      }
      if (!r.ok) {
        const data = await responseJson(r, { error: "Failed to remove admin" });
        setAdminsError((data as { error?: string }).error ?? "Failed to remove admin");
        return;
      }
      setAdmins((prev) => prev.filter((a) => a.userId !== userId));
    } catch {
      setAdminsError("Failed to remove admin");
    } finally {
      setRemovingAdminUserId(null);
    }
  }

  async function toggleSimulate(userId: string, simulate: boolean) {
    const token = getStoredToken();
    if (!token) return;
    setTogglingUserId(userId);
    try {
      const r = await fetch(api("/api/admin/usage/simulate-limit"), {
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
    if (!token) return;
    const q = userSearchQuery.trim();
    setUserSearchError(null);
    setUserSearchLoading(true);
    try {
      const params = q ? new URLSearchParams({ [userSearchBy]: q }) : "";
      const r = await fetch(api(`/api/admin/users${params ? `?${params}` : ""}`), {
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
    if (!token) return;
    setSettingTierUserId(userId);
    try {
      const r = await fetch(api("/api/admin/users/set-tier"), {
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

  async function fetchAdminServers() {
    const token = getStoredToken();
    if (!token) return;
    setAdminServersLoading(true);
    try {
      const params = new URLSearchParams();
      if (adminServersFilter === "trash") params.set("trashed", "1");
      if (adminServersUserId.trim()) params.set("userId", adminServersUserId.trim());
      const r = await fetch(api(`/api/admin/servers${params.toString() ? `?${params}` : ""}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) {
        clearStoredAuth();
        router.replace(getPath("login", locale));
        return;
      }
      if (r.status === 403) return;
      const data = await responseJson(r, { servers: [] });
      setAdminServers(data.servers ?? []);
    } catch {
      setAdminServers([]);
    } finally {
      setAdminServersLoading(false);
    }
  }

  async function adminServerTrash(serverId: string) {
    const token = getStoredToken();
    if (!token) return;
    setAdminServerActionId(serverId);
    try {
      const r = await fetch(api(`/api/admin/servers/${serverId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trashed: true }),
      });
      if (r.ok) fetchAdminServers();
    } finally {
      setAdminServerActionId(null);
    }
  }

  async function adminServerRestore(serverId: string) {
    const token = getStoredToken();
    if (!token) return;
    setAdminServerActionId(serverId);
    try {
      const r = await fetch(api(`/api/admin/servers/${serverId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restoreFromTrash: true }),
      });
      if (r.ok) fetchAdminServers();
    } finally {
      setAdminServerActionId(null);
    }
  }

  async function adminServerDelete(serverId: string) {
    if (!confirm("Permanently delete this server and all its backups? This cannot be undone.")) return;
    const token = getStoredToken();
    if (!token) return;
    setAdminServerActionId(serverId);
    try {
      const r = await fetch(api(`/api/admin/servers/${serverId}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) fetchAdminServers();
    } finally {
      setAdminServerActionId(null);
    }
  }

  async function removeUserTierOverride(userId: string) {
    const token = getStoredToken();
    if (!token) return;
    setRemovingTierUserId(userId);
    try {
      const r = await fetch(api(`/api/admin/users/${userId}/tier`), {
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
          Admin access is granted via DEV_TIER_OVERRIDE_EMAIL (bootstrap) or by being added as admin by another admin.
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
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <SafeIcon><ShieldPlus className="h-4 w-4" /></SafeIcon>
                Admin management
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Manage who has admin access. Bootstrap admins (from DEV_TIER_OVERRIDE_EMAIL) are always admins and do not appear here.
              </p>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  value={addAdminEmail}
                  onChange={(e) => setAddAdminEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addAdminByEmail()}
                  placeholder="Add admin by email"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm min-w-[200px]"
                  aria-label="Add admin by email"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => addAdminByEmail()}
                  disabled={addingAdmin || !addAdminEmail.trim()}
                >
                  {addingAdmin ? "…" : "Add admin"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                User must already have an account. Or find them in <strong>User management</strong> below and click &quot;Make admin&quot;.
              </p>
              {adminSuccessMessage && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
                  {adminSuccessMessage}
                </p>
              )}
              {adminsError && (
                <p className="text-sm text-destructive">{adminsError}</p>
              )}
              {adminsLoading ? (
                <p className="text-sm text-muted-foreground">Loading admins…</p>
              ) : admins.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 font-medium text-foreground">Email</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Added by</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Added at</th>
                        <th className="text-left px-4 py-2.5 font-medium text-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admins.map((a) => (
                        <tr key={a.userId} className="border-b border-border/80 hover:bg-muted/20">
                          <td className="px-4 py-2.5 text-foreground">{a.email}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{a.addedByEmail}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {new Date(a.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1.5"
                              onClick={() => removeAdmin(a.userId)}
                              disabled={removingAdminUserId === a.userId}
                            >
                              <SafeIcon><ShieldX className="h-3.5 w-3.5" /></SafeIcon>
                              {removingAdminUserId === a.userId ? "…" : "Remove admin"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No DB-backed admins yet. Bootstrap admins (from env) do not appear here.</p>
              )}
            </div>
          </div>

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
                            {adminUserIds.has(u.userId) && (
                              <span className="ml-1.5 rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">Admin</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 flex flex-wrap items-center gap-2">
                            {!adminUserIds.has(u.userId) ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="text-xs"
                                onClick={() => addAdminByUserId(u.userId)}
                                disabled={makingAdminUserId === u.userId}
                              >
                                {makingAdminUserId === u.userId ? "…" : "Make admin"}
                              </Button>
                            ) : null}
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

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <SafeIcon><Server className="h-4 w-4" /></SafeIcon>
                Server management
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Browse and manage any user&apos;s servers. Trash / restore / permanently delete. Items in trash auto-delete after 30 days.
              </p>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={adminServersFilter}
                  onChange={(e) => setAdminServersFilter(e.target.value as "active" | "trash")}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  aria-label="Filter"
                >
                  <option value="active">Active servers</option>
                  <option value="trash">Trash</option>
                </select>
                <input
                  type="text"
                  value={adminServersUserId}
                  onChange={(e) => setAdminServersUserId(e.target.value)}
                  placeholder="Filter by user ID"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm min-w-[180px]"
                  aria-label="User ID filter"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchAdminServers()}
                  disabled={adminServersLoading}
                >
                  <SafeIcon><RefreshCw className="h-3.5 w-3.5" /></SafeIcon>
                  {adminServersLoading ? "…" : "Refresh"}
                </Button>
              </div>
              {adminServers.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 font-medium text-foreground">User</th>
                        <th className="text-left px-4 py-2.5 font-medium text-foreground">Server name</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Host ID</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Backups</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Trashed at</th>
                        <th className="text-left px-4 py-2.5 font-medium text-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminServers.map((s) => (
                        <tr key={s.id} className="border-b border-border/80 hover:bg-muted/20">
                          <td className="px-4 py-2.5 text-foreground text-xs">{s.userEmail}</td>
                          <td className="px-4 py-2.5 font-medium text-foreground">{s.name || "Unnamed"}</td>
                          <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{s.hostId}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{s.backupCount}</td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">
                            {s.trashedAt ? new Date(s.trashedAt).toLocaleString() : "—"}
                          </td>
                          <td className="px-4 py-2.5 flex flex-wrap items-center gap-2">
                            {adminServersFilter === "active" ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-xs text-amber-600 hover:text-amber-700"
                                onClick={() => adminServerTrash(s.id)}
                                disabled={adminServerActionId === s.id}
                              >
                                <SafeIcon><Trash2 className="h-3.5 w-3.5" /></SafeIcon>
                                {adminServerActionId === s.id ? "…" : "Move to trash"}
                              </Button>
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs text-emerald-600 hover:text-emerald-700"
                                  onClick={() => adminServerRestore(s.id)}
                                  disabled={adminServerActionId === s.id}
                                >
                                  <SafeIcon><RotateCcw className="h-3.5 w-3.5" /></SafeIcon>
                                  {adminServerActionId === s.id ? "…" : "Restore"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs text-destructive"
                                  onClick={() => adminServerDelete(s.id)}
                                  disabled={adminServerActionId === s.id}
                                >
                                  <SafeIcon><Trash2 className="h-3.5 w-3.5" /></SafeIcon>
                                  {adminServerActionId === s.id ? "…" : "Delete permanently"}
                                </Button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {adminServersLoading ? "Loading servers…" : adminServersFilter === "trash" ? "No servers in trash." : "No active servers. Filter by user ID if needed."}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
