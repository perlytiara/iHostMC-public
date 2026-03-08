"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { getPath, type Locale } from "@/i18n/pathnames";
import { useLocale } from "next-intl";
import { getApiBaseUrl, getStoredToken, clearStoredAuth } from "@/lib/api";
import { DashboardLoadingBlock } from "@/components/DashboardLoadingBlock";

interface Me {
  userId: string;
  email: string;
  displayName?: string | null;
  username?: string | null;
  emailVerified?: boolean;
}

interface Tier {
  id: string;
  name: string;
  priceUsd: number;
}

interface SubStatus {
  status: string;
  currentPeriodEnd: string | null;
  endsAtPeriodEnd?: boolean;
  tierId: string;
  tier: Tier;
  devOverride?: boolean;
}

function ManageBillingButton({ base, token }: { base: string; token: string }) {
  const [loading, setLoading] = useState(false);
  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/api/stripe/customer-portal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      if (data?.url) window.open(data.url, "_blank", "noopener");
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="inline-block rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
    >
      {loading ? "Opening…" : "Manage billing"}
    </button>
  );
}

const OAUTH_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  discord: "Discord",
  microsoft: "Microsoft",
};

function DashboardAccountContent() {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const [me, setMe] = useState<Me | null>(null);
  const [sub, setSub] = useState<SubStatus | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ displayName: "", username: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [editMode, setEditMode] = useState(false);

  const token = getStoredToken();
  const base = getApiBaseUrl();

  const load = useCallback(() => {
    if (!token || !base) {
      setLoading(false);
      return;
    }
    const auth = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${base}/api/auth/me`, { headers: auth }).then((r) => {
        if (r.status === 401 || r.status === 403) {
          clearStoredAuth();
          router.replace(getPath("login", locale));
          return null;
        }
        return r.json().catch(() => null);
      }),
      fetch(`${base}/api/subscription/status`, { headers: auth }).then((r) =>
        r.status === 401 || r.status === 403 ? null : r.json().catch(() => null)
      ),
      fetch(`${base}/api/auth/providers`).then((r) =>
        r.json().then((d: { providers?: string[] }) => d?.providers ?? [])
      ),
    ]).then(([meData, subData, provs]) => {
      if (meData === null && subData === undefined) return;
      setMe(meData ?? null);
      setSub(subData ?? null);
      setProviders(Array.isArray(provs) ? provs : []);
      if (meData) {
        setProfile({
          displayName: meData.displayName ?? "",
          username: meData.username ?? "",
        });
      }
    }).finally(() => setLoading(false));
  }, [token, base, router, locale]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveProfile = async () => {
    if (!token || !base) return;
    setProfileSaving(true);
    setProfileError("");
    try {
      const res = await fetch(`${base}/api/auth/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          displayName: profile.displayName.trim() || null,
          username: profile.username.trim()
            ? profile.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "")
            : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileError(data?.error ?? "Failed to update");
        return;
      }
      setMe((prev) => (prev ? { ...prev, ...data } : null));
      setEditMode(false);
    } catch {
      setProfileError("Network error");
    } finally {
      setProfileSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
    setProfile({
      displayName: me?.displayName ?? "",
      username: me?.username ?? "",
    });
    setProfileError("");
  };

  if (loading) return <DashboardLoadingBlock />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Your profile and subscription. Password and security are in Settings.
        </p>
      </div>

      {/* Profile: view vs edit mode */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="font-semibold">Profile</h2>
          {!editMode ? (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="rounded bg-zinc-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-600"
            >
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded border border-zinc-600 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={profileSaving}
                className="rounded bg-zinc-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
              >
                {profileSaving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Email</label>
            <p className="font-medium">{me?.email ?? "—"}</p>
          </div>
          {editMode ? (
            <>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Display name</label>
                <input
                  type="text"
                  value={profile.displayName}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, displayName: e.target.value }))
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Username</label>
                <input
                  type="text"
                  value={profile.username}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      username: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                    }))
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white font-mono"
                  maxLength={50}
                  placeholder="optional"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Display name</label>
                <p className="font-medium">{me?.displayName || "—"}</p>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Username</label>
                <p className="font-medium font-mono">{me?.username || "—"}</p>
              </div>
            </>
          )}
        </div>
        {profileError && (
          <p className="text-sm text-red-400 mt-2">{profileError}</p>
        )}
      </section>

      {/* Login methods */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="font-semibold mb-2">Sign in options</h2>
        <p className="text-sm text-zinc-400 mb-4">
          You can sign in with email and password, or use one of these services. To change your password or manage passkeys, go to{" "}
          <Link href={getPath("dashboardSettings", locale)} className="text-primary hover:underline">
            Settings → Security
          </Link>
          .
        </p>
        <ul className="space-y-2">
          <li className="text-sm text-zinc-300">Email &amp; password (always available)</li>
          {providers.map((p) => (
            <li key={p} className="text-sm text-zinc-300">
              {OAUTH_LABELS[p] ?? p}
            </li>
          ))}
        </ul>
        {providers.length === 0 && (
          <p className="text-xs text-zinc-500 mt-2">
            No additional sign-in providers are configured on the server.
          </p>
        )}
      </section>

      {/* Subscription */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="font-semibold mb-2">Subscription</h2>
        <p className="text-sm text-zinc-400 mb-2">
          Current plan: <strong className="text-white">{sub?.tier?.name ?? "Free"}</strong>
          {sub?.devOverride && (
            <span className="ml-2 rounded bg-amber-900/50 px-2 py-0.5 text-xs text-amber-200">
              Dev override
            </span>
          )}
        </p>
        {sub?.currentPeriodEnd && (
          <p className="text-sm text-zinc-400">
            {sub.endsAtPeriodEnd ? "Access until" : "Renews"}{" "}
            {new Date(sub.currentPeriodEnd).toLocaleDateString()}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/pricing"
            className="inline-block rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600"
          >
            View plans
          </Link>
          {sub?.tier?.priceUsd && token && (
            <ManageBillingButton base={base} token={token} />
          )}
        </div>
      </section>
    </div>
  );
}

export default function DashboardAccountPage() {
  return (
    <Suspense fallback={<DashboardLoadingBlock />}>
      <DashboardAccountContent />
    </Suspense>
  );
}
