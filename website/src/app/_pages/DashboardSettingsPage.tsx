"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { getPath, type Locale } from "@/i18n/pathnames";
import { getApiBaseUrl, getStoredToken, clearStoredAuth } from "@/lib/api";
import { DashboardLoadingBlock } from "@/components/DashboardLoadingBlock";
import { FolderArchive, HardDrive, FileArchive, Shield, Bug, ChevronDown, ChevronRight } from "lucide-react";

interface SubStatus {
  tier?: { id: string; name: string };
  devOverride?: boolean;
}

interface PasskeyRow {
  id: string;
  deviceType: string | null;
  createdAt: string;
}

function DashboardSettingsContent() {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const [subStatus, setSubStatus] = useState<SubStatus | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNew, setPasswordNew] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyDeleting, setPasskeyDeleting] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  const token = getStoredToken();
  const base = getApiBaseUrl();

  const loadPasskeys = useCallback(() => {
    if (!token || !base) return;
    fetch(`${base}/api/auth/webauthn/credentials`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.status === 401 || r.status === 403 ? [] : r.json().then((d: { credentials?: PasskeyRow[] }) => d?.credentials ?? [])))
      .then(setPasskeys);
  }, [token, base]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    if (!base) {
      setLoading(false);
      return;
    }
    const auth = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${base}/api/subscription/status`, { headers: auth }).then((r) => {
        if (r.status === 401 || r.status === 403) {
          clearStoredAuth();
          router.replace(getPath("login", locale));
          return null;
        }
        return r.json().catch(() => null);
      }),
      fetch(`${base}/api/auth/webauthn/credentials`, { headers: auth }).then((r) =>
        r.status === 401 || r.status === 403 ? [] : r.json().then((d: { credentials?: PasskeyRow[] }) => d?.credentials ?? [])
      ),
    ]).then(([sub, creds]) => {
      setSubStatus(sub ?? null);
      setPasskeys(Array.isArray(creds) ? creds : []);
    }).finally(() => setLoading(false));
  }, [router, locale, token, base]);

  const handleChangePassword = async () => {
    if (!token || !base) return;
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
      const res = await fetch(`${base}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: passwordCurrent, newPassword: passwordNew }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordError(data?.error ?? "Failed to change password");
        return;
      }
      setPasswordCurrent("");
      setPasswordNew("");
      setPasswordConfirm("");
    } catch {
      setPasswordError("Network error");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleAddPasskey = async () => {
    if (!token || !base) return;
    setPasskeyLoading(true);
    try {
      const optRes = await fetch(`${base}/api/auth/webauthn/register-options`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const options = await optRes.json().catch(() => null);
      if (!optRes.ok || !options) {
        setPasskeyLoading(false);
        return;
      }
      const { startRegistration } = await import("@simplewebauthn/browser");
      const cred = await startRegistration({
        optionsJSON: options as Parameters<typeof startRegistration>[0]["optionsJSON"],
      });
      const verifyRes = await fetch(`${base}/api/auth/webauthn/register-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ response: cred }),
      });
      if (verifyRes.ok) loadPasskeys();
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    if (!token || !base) return;
    setPasskeyDeleting(id);
    try {
      const res = await fetch(`${base}/api/auth/webauthn/credentials/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPasskeys((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setPasskeyDeleting(null);
    }
  };

  const hasBackupTier =
    subStatus?.tier?.id === "backup" || subStatus?.tier?.id === "pro" || subStatus?.devOverride;

  if (loading) return <DashboardLoadingBlock />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Security, backup preferences, and storage options for your servers.
        </p>
      </div>

      {/* Security: password + passkeys */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-emerald-500" aria-hidden />
          <h2 className="font-semibold text-lg">Security</h2>
        </div>
        <div className="space-y-6">
          <div>
            <h3 className="font-medium mb-2">Change password</h3>
            <div className="grid gap-3 max-w-sm">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Current password</label>
                <input
                  type="password"
                  value={passwordCurrent}
                  onChange={(e) => setPasswordCurrent(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">New password</label>
                <input
                  type="password"
                  value={passwordNew}
                  onChange={(e) => setPasswordNew(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Confirm new password</label>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
                  autoComplete="new-password"
                />
              </div>
              {passwordError && <p className="text-sm text-red-400">{passwordError}</p>}
              <button
                type="button"
                onClick={handleChangePassword}
                disabled={passwordSaving}
                className="rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
              >
                {passwordSaving ? "Updating…" : "Update password"}
              </button>
            </div>
          </div>
          <div>
            <h3 className="font-medium mb-2">Passkeys</h3>
            <p className="text-sm text-zinc-400 mb-4">
              Add a passkey to sign in without a password on this device.
            </p>
            <button
              type="button"
              onClick={handleAddPasskey}
              disabled={passkeyLoading}
              className="rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50 mb-4"
            >
              {passkeyLoading ? "Adding…" : "Add passkey"}
            </button>
            {passkeys.length > 0 ? (
              <ul className="space-y-2">
                {passkeys.map((pk) => (
                  <li
                    key={pk.id}
                    className="flex items-center justify-between gap-2 rounded border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm"
                  >
                    <span className="text-zinc-300 font-mono text-xs truncate">
                      {pk.deviceType ?? pk.id.slice(0, 12)}…
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeletePasskey(pk.id)}
                      disabled={passkeyDeleting === pk.id}
                      className="text-red-400 hover:text-red-300 text-xs disabled:opacity-50"
                    >
                      {passkeyDeleting === pk.id ? "…" : "Remove"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-zinc-500">No passkeys added yet.</p>
            )}
          </div>
        </div>
      </section>

      {/* Backup preferences */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <FolderArchive className="h-5 w-5 text-emerald-500" aria-hidden />
          <h2 className="font-semibold text-lg">Backup preferences</h2>
        </div>
        <p className="text-sm text-zinc-400 mb-4 max-w-2xl">
          When you sync from the iHost app, we save <strong className="text-zinc-300">mini files</strong> (configs,
          mod and plugin names, folder hierarchy) in your included storage. Full server archives (worlds,
          large files) are stored separately and count toward your backup quota—with clear limits so
          we stay fair and sustainable.
        </p>
        <ul className="space-y-2 text-sm text-zinc-400 mb-6">
          <li className="flex items-start gap-2">
            <FileArchive className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" aria-hidden />
            <span>
              <strong className="text-zinc-300">Mini files:</strong> Always synced (hierarchy, configs, mod/plugin
              names). Snapshots update when files or folders change so you can restore structure quickly.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <HardDrive className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
            <span>
              <strong className="text-zinc-300">Full backups:</strong> Zipped server data. Limited per tier; larger
              storage is available at an added cost so we can keep base plans cheap.
            </span>
          </li>
        </ul>
        <Link
          href={getPath("dashboardBackups", locale)}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 transition-colors"
        >
          <FolderArchive className="h-4 w-4" aria-hidden />
          Manage backups
        </Link>
      </section>

      {/* Tier limits summary */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="font-semibold text-lg mb-2">Backup limits by plan</h2>
        <p className="text-sm text-zinc-400 mb-4">
          Limits prevent abuse and keep pricing simple. We optimize storage and pass savings on.
        </p>
        <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4 max-w-xl">
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-400">Free</dt>
              <dd className="text-zinc-200">Few backups; upload only. No app sync.</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-400">Backup / Pro</dt>
              <dd className="text-zinc-200">
                More backups per server; choose how many to keep and how often. Sync from app.
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-400">Extra storage</dt>
              <dd className="text-zinc-200">Large archives: priced by size (e.g. per GB) for big worlds.</dd>
            </div>
          </dl>
        </div>
        {!hasBackupTier && (
          <Link
            href="/pricing"
            className="mt-4 inline-block rounded-lg bg-primary/20 text-primary px-4 py-2 text-sm font-medium hover:bg-primary/30 transition-colors"
          >
            Upgrade for more backups and sync →
          </Link>
        )}
      </section>

      {/* Integrity note */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="font-semibold text-lg mb-2">Backup integrity</h2>
        <p className="text-sm text-zinc-400 max-w-2xl">
          Backups are stored with checksums so we can verify and repair. When you download or restore,
          the app can confirm integrity. Corrupt or partial uploads are rejected.
        </p>
      </section>

      {/* Debug (for developers) */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <button
          type="button"
          onClick={() => setDebugOpen((o) => !o)}
          className="flex w-full items-center gap-2 p-4 text-left hover:bg-zinc-800/50 transition-colors"
          aria-expanded={debugOpen}
        >
          <Bug className="h-5 w-5 text-amber-500 shrink-0" aria-hidden />
          <h2 className="font-semibold text-lg">Debug</h2>
          <span className="text-xs text-zinc-500">for developers</span>
          {debugOpen ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
        </button>
        {debugOpen && (
          <div className="border-t border-zinc-800 p-4 space-y-4 bg-zinc-900/30">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">API base URL</label>
              <code className="block rounded border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-300 font-mono break-all">
                {base || "(not set)"}
              </code>
            </div>
            <p className="text-xs text-zinc-500">
              Use this to verify the website is talking to the correct backend. Token is stored in browser storage; clear it to sign out.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

export default function DashboardSettingsPage() {
  return (
    <Suspense fallback={<DashboardLoadingBlock />}>
      <DashboardSettingsContent />
    </Suspense>
  );
}
