"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Download,
  Server,
  Activity,
  ArrowRight,
  User,
  HardDrive,
  RefreshCw,
  Settings,
  ExternalLink,
  Cloudy,
  KeyRound,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { isBackendConfigured, api, getWebsiteBackupsUrl, getWebsiteUrl } from "@/lib/api-client";
import { useAuthStore } from "@/features/auth";
import { useAccountData } from "@/contexts/AccountDataContext";
import { useServers } from "@/features/servers/hooks/useServers";
import { useSyncServers } from "@/features/servers/hooks/useSyncServers";
import { getToken } from "@/features/auth";
import { cn } from "@/lib/utils";
import { getAutoBackupEnabled } from "@/lib/sync-prefs";
import {
  applyStorageDevOverride,
  getDevStorageSimulateFull,
  getDevUsageUnlimited,
} from "@/lib/dev-overrides";
import { useDevOverrides } from "@/hooks/useDevOverrides";

interface HomePageProps {
  serverCount: number;
  runningCount: number;
  onCreateServer: () => void;
  onImportServer: () => void;
  onGoToServers: () => void;
  onGoToAi?: () => void;
  onOpenAccount?: () => void;
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 140, damping: 16 },
  },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function HomePage({
  serverCount,
  runningCount,
  onCreateServer,
  onImportServer,
  onGoToServers,
  onGoToAi,
  onOpenAccount,
}: HomePageProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const token = getToken();
  const accountData = useAccountData();
  const subscription = accountData?.subscription ?? null;
  const usage = accountData?.usage ?? null;
  const accountLoading = accountData?.loading ?? false;
  const { servers } = useServers();
  const { syncedServers, lastSyncedAt, syncing, syncNow } = useSyncServers(servers, token, {
    autoSyncOnLoad: getAutoBackupEnabled(),
  });
  const { usageUnlimited } = useDevOverrides();
  const [report, setReport] = useState<{
    totalSizeBytes: number;
    totalCount: number;
    storageLimitBytes: number | null;
    tierId?: string;
  } | null>(null);
  const showSignInPrompt = isBackendConfigured() && !user && onOpenAccount;
  const isSignedIn = !!user && !!token;

  useEffect(() => {
    if (!token || !isBackendConfigured()) return;
    api
      .getBackupReport(token)
      .then((r) =>
        setReport({
          totalSizeBytes: r.totalSizeBytes,
          totalCount: r.totalCount,
          storageLimitBytes: r.storageLimitBytes ?? null,
          tierId: r.tierId,
        })
      )
      .catch(() => setReport(null));
  }, [token]);

  const storageUsed = report?.totalSizeBytes ?? 0;
  const storageLimit = report?.storageLimitBytes ?? null;
  const { displayUsed, displayLimit, displayPct } = applyStorageDevOverride(
    storageUsed,
    storageLimit
  );
  const devStorageSimulate = getDevStorageSimulateFull();
  const syncedCount = syncedServers.length;
  const backupsUrl = getWebsiteBackupsUrl();
  const websiteUrl = getWebsiteUrl();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-auto bg-[hsl(var(--background))]">
      {/* Punk-style background: sharp gradient bars */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(90deg, transparent 0%, hsl(var(--foreground)) 20%, transparent 40%, hsl(var(--foreground)) 60%, transparent 80%)`,
            backgroundSize: "200% 100%",
          }}
        />
        <div
          className="absolute -left-40 -top-40 h-80 w-80 rounded-full opacity-[0.06] blur-[80px]"
          style={{ background: `hsl(var(--glow-1))` }}
        />
        <div
          className="absolute -bottom-32 -right-32 h-64 w-64 rounded-full opacity-[0.05] blur-[80px]"
          style={{ background: `hsl(var(--glow-2))` }}
        />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 flex min-h-0 w-full flex-1 flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8"
      >
        {/* Hero strip: what the app is + what to do */}
        <motion.div variants={itemVariants} className="space-y-1">
          <h1 className="font-mono text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {t("home.welcome")}
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            {t("home.subtitle")}
          </p>
        </motion.div>

        {isSignedIn ? (
          <>
            {/* Storage at a glance — one big widget */}
            <motion.div variants={itemVariants} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("home.storageTitle", "Total storage")}
                </span>
                {devStorageSimulate && (
                  <span className="rounded border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-600 dark:text-amber-400">
                    {t("home.devSimulate", "Dev: simulating full")}
                  </span>
                )}
              </div>
              <Card
                size="sm"
                className={cn(
                  "border-2 border-border/90 font-mono shadow-sm",
                  (displayPct ?? 0) >= 90 && "border-destructive/40 bg-destructive/5"
                )}
              >
                <CardContent className="flex flex-col gap-3 pt-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
                      {formatBytes(displayUsed)}
                    </span>
                    {displayLimit != null && displayLimit > 0 && (
                      <span className="text-sm text-muted-foreground">
                        / {formatBytes(displayLimit)}
                      </span>
                    )}
                  </div>
                  {displayPct != null && (
                    <div className="h-2 w-full overflow-hidden rounded-sm bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-sm transition-all",
                          displayPct >= 90 ? "bg-destructive" : "bg-primary"
                        )}
                        style={{ width: `${Math.min(100, displayPct)}%` }}
                      />
                    </div>
                  )}
                  {report?.tierId && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {report.tierId}
                    </span>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Compact stats row */}
            <motion.div
              variants={itemVariants}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {[
                {
                  label: t("home.serversSynced", "Servers synced"),
                  value: `${syncedCount} / ${serverCount}`,
                  icon: Server,
                },
                {
                  label: t("home.runningNow", "Running now"),
                  value: String(runningCount),
                  icon: Activity,
                },
                {
                  label: t("home.backups", "Backups"),
                  value: String(report?.totalCount ?? 0),
                  icon: Cloudy,
                },
                {
                  label: t("home.usage", "Usage"),
                  value:
                    usageUnlimited && usage
                      ? t("home.usageUnlimitedDev", "Unlimited (dev)")
                      : usage
                        ? `${usage.used} / ${usage.limit}${usage.period ? ` (${usage.period})` : ""}`
                        : "—",
                  icon: KeyRound,
                },
              ].map(({ label, value, icon: Icon }) => (
                <Card
                  key={label}
                  size="sm"
                  className="border border-border/80 bg-card/80 py-2.5 font-mono"
                >
                  <CardContent className="flex items-center gap-2 pt-0">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {label}
                      </p>
                      <p className="truncate text-sm font-semibold tabular-nums text-foreground">
                        {value}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </motion.div>

            {/* Live sync + account row */}
            <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onGoToServers}>
                <RefreshCw className="h-3.5 w-3.5" />
                {t("home.viewLiveSync", "View live sync")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => syncNow()}
                disabled={syncing || serverCount === 0}
              >
                {syncing ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    {t("home.syncing", "Syncing…")}
                  </>
                ) : (
                  t("home.syncNow", "Sync now")
                )}
              </Button>
              {backupsUrl && (
                <a
                  href={backupsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t("home.openBackupsWeb", "Open backups on web")}
                </a>
              )}
              <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={onOpenAccount}>
                <Settings className="h-3.5 w-3.5" />
                {t("home.settings", "Settings")}
              </Button>
            </motion.div>

            {/* API & AI — ready for xAPI, keys, usage */}
            <motion.div variants={itemVariants}>
              <Card className="border-2 border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-foreground">
                      {t("home.apiAiTitle", "API & AI")}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "home.apiAiDesc",
                      "Create servers and run prompts via API. Manage keys on the website — usage tracked, keys stay private."
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {onGoToAi && (
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-1.5"
                        onClick={onGoToAi}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {t("home.openAdvisor", "Talk to Advisor")}
                      </Button>
                    )}
                    {websiteUrl && (
                      <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        {t("home.apiAiCta", "Get API keys & docs")}
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </>
        ) : (
          <>
            {showSignInPrompt && (
              <motion.div variants={itemVariants}>
                <Card className="border-2 border-primary/30 bg-primary/5">
                  <CardContent className="flex flex-col items-center gap-3 py-6">
                    <p className="text-center text-sm font-medium text-foreground">
                      {t("home.signInToSync")}
                    </p>
                    <Button size="lg" className="gap-2" onClick={onOpenAccount}>
                      <User className="h-4 w-4" />
                      {t("home.openAccount")}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </>
        )}

        {/* Quick actions — always visible */}
        <motion.div variants={itemVariants} className="mt-auto space-y-3 pt-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("home.quickActions", "Quick actions")}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              className="gap-2 rounded-lg border-2 font-semibold shadow-sm"
              onClick={onCreateServer}
            >
              <Plus className="h-4 w-4" />
              {t("home.createServer")}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="gap-2 rounded-lg border-2"
              onClick={onImportServer}
            >
              <Download className="h-4 w-4" />
              {t("home.importServer")}
            </Button>
            {serverCount > 0 && (
              <Button
                variant="ghost"
                size="lg"
                className="gap-2 rounded-lg"
                onClick={onGoToServers}
              >
                {t("home.goToServers")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </motion.div>

        {serverCount === 0 && !isSignedIn && (
          <motion.div
            variants={itemVariants}
            className="text-center text-xs text-muted-foreground"
          >
            {t("home.firstTimeHint")}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
