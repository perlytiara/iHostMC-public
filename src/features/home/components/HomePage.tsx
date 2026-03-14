"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Download,
  Server,
  Activity,
  User,
  RefreshCw,
  Settings,
  ExternalLink,
  Cloudy,
  KeyRound,
  Sparkles,
  Play,
  Share2,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isBackendConfigured, api, getWebsiteBackupsUrl } from "@/lib/api-client";
import { useAuthStore } from "@/features/auth";
import { useAccountData } from "@/contexts/AccountDataContext";
import { useServers } from "@/features/servers/hooks/useServers";
import { useSyncServers } from "@/features/servers/hooks/useSyncServers";
import { getToken } from "@/features/auth";
import { getAutoBackupEnabled } from "@/lib/sync-prefs";
import {
  applyStorageDevOverride,
  getDevUsageUnlimited,
} from "@/lib/dev-overrides";
import { useDevOverrides } from "@/hooks/useDevOverrides";
import { HomeHeroIllustration } from "@/components/HomeHeroIllustration";
import { StatefulBackground } from "@/components/StatefulBackground";

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
  visible: { transition: { staggerChildren: 0.03, delayChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 24 } },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Signed-out: single screen, centered, no scroll. */
function HomeSignedOut({
  t,
  showSignInPrompt,
  onCreateServer,
  onImportServer,
  onOpenAccount,
}: {
  t: (key: string) => string;
  showSignInPrompt: boolean;
  onCreateServer: () => void;
  onImportServer: () => void;
  onOpenAccount?: () => void;
}) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex h-full flex-col items-center justify-center gap-6 px-4 py-5 sm:gap-8 sm:px-6"
    >
      <motion.div variants={itemVariants} className="flex flex-col items-center text-center">
        <HomeHeroIllustration size={80} single className="mb-2 opacity-90" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t("home.oneServer")}
        </h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {t("home.subtitle")}
        </p>
      </motion.div>
      <motion.div
        variants={itemVariants}
        className="grid w-full max-w-md grid-cols-2 gap-3 sm:gap-4"
      >
        <Button
          size="lg"
          className="gap-2 rounded-xl font-semibold"
          onClick={onCreateServer}
          data-tour="create-server"
        >
          <Plus className="h-4 w-4" />
          {t("home.createServer")}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="gap-2 rounded-xl"
          onClick={onImportServer}
          data-tour="import-server"
        >
          <Download className="h-4 w-4" />
          {t("home.importServer")}
        </Button>
      </motion.div>
      {showSignInPrompt && onOpenAccount && (
        <motion.div variants={itemVariants} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("home.signInToSync")}</span>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={onOpenAccount}>
            <User className="h-3.5 w-3.5" />
            {t("home.openAccount")}
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}

/** Signed-in: single screen, two-column balanced, no scroll. */
function HomeSignedIn({
  t,
  serverCount,
  runningCount,
  firstServerName,
  displayUsed,
  displayLimit,
  syncedCount,
  usage,
  usageUnlimited,
  syncing,
  report,
  backupsUrl,
  onGoToServers,
  onCreateServer,
  onImportServer,
  syncNow,
  onGoToAi,
  onOpenAccount,
}: {
  t: (key: string) => string;
  serverCount: number;
  runningCount: number;
  firstServerName: string | null;
  displayUsed: number;
  displayLimit: number | null;
  syncedCount: number;
  usage: { used: number; limit: number; period?: string } | null;
  usageUnlimited: boolean;
  syncing: boolean;
  report: { totalCount: number } | null;
  backupsUrl: string | null;
  onGoToServers: () => void;
  onCreateServer: () => void;
  onImportServer: () => void;
  syncNow: () => void;
  onGoToAi?: () => void;
  onOpenAccount?: () => void;
}) {
  const usageStr =
    usageUnlimited && usage
      ? t("home.usageUnlimitedDev")
      : usage
        ? `${usage.used}/${usage.limit}`
        : "—";

  const hasServers = serverCount > 0;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid h-full grid-rows-[auto_1fr_auto] gap-3 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5"
    >
      {/* Row 1: one server block or create/import when none */}
      {hasServers ? (
        <motion.div
          variants={itemVariants}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 sm:px-5 sm:py-3.5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/20">
              <Server className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {serverCount === 1 ? t("home.yourOneServer") : t("home.yourServers")}
              </p>
              <p className="truncate text-lg font-bold text-foreground sm:text-xl">
                {serverCount === 1 && firstServerName
                  ? firstServerName
                  : t("home.totalServers", { count: serverCount })}
              </p>
            </div>
            {runningCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                {t("home.runningNow")}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5 rounded-lg" onClick={onGoToServers}>
              <Play className="h-3.5 w-3.5" />
              {t("home.openServer")}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={onGoToServers}>
              <Share2 className="h-3.5 w-3.5" />
              {t("servers.shareServer")}
            </Button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          variants={itemVariants}
          className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 sm:gap-4 sm:px-5 sm:py-3.5"
        >
          <p className="text-sm font-semibold text-foreground">{t("home.createYourOne")}</p>
          <div className="flex gap-2">
            <Button size="sm" className="gap-1.5 rounded-lg" onClick={onCreateServer} data-tour="create-server">
              <Plus className="h-3.5 w-3.5" />
              {t("home.createServer")}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={onImportServer} data-tour="import-server">
              <Download className="h-3.5 w-3.5" />
              {t("home.importServer")}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Row 2: 2x2 stats — balanced */}
      <motion.div
        variants={itemVariants}
        className="grid min-h-0 grid-cols-2 gap-2 sm:gap-3"
      >
        <Card className="border border-border/80 bg-card/50 py-2.5">
          <CardContent className="flex items-center gap-2 pt-0">
            <Cloudy className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("home.storageTitle")}
              </p>
              <p className="truncate text-sm font-semibold tabular-nums text-foreground">
                {formatBytes(displayUsed)}
                {displayLimit != null && displayLimit > 0 && ` / ${formatBytes(displayLimit)}`}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border/80 bg-card/50 py-2.5">
          <CardContent className="flex items-center gap-2 pt-0">
            <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("home.serversSynced")}
              </p>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {syncedCount} / {serverCount}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border/80 bg-card/50 py-2.5">
          <CardContent className="flex items-center gap-2 pt-0">
            <Activity className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("home.runningNow")}
              </p>
              <p className="text-sm font-semibold tabular-nums text-foreground">{runningCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border/80 bg-card/50 py-2.5">
          <CardContent className="flex items-center gap-2 pt-0">
            <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("home.usage")}
              </p>
              <p className="truncate text-sm font-semibold tabular-nums text-foreground">
                {usageStr}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Row 3: one row of actions */}
      <motion.div
        variants={itemVariants}
        className="flex flex-wrap items-center justify-center gap-2 border-t border-border/50 pt-3 sm:justify-between sm:pt-4"
      >
        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={onGoToServers}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t("home.viewLiveSync")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 rounded-lg"
            onClick={() => syncNow()}
            disabled={syncing || serverCount === 0}
          >
            {syncing ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              t("home.syncNow")
            )}
          </Button>
          {backupsUrl && (
            <a
              href={backupsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("home.openBackupsWeb")}
            </a>
          )}
          {onGoToAi && (
            <Button size="sm" variant="ghost" className="gap-1.5 rounded-lg" onClick={onGoToAi}>
              <Sparkles className="h-3.5 w-3.5" />
              {t("home.openAdvisor")}
            </Button>
          )}
        </div>
        {onOpenAccount && (
          <Button size="sm" variant="ghost" className="gap-1.5 rounded-lg" onClick={onOpenAccount}>
            <Settings className="h-3.5 w-3.5" />
            {t("home.settings")}
          </Button>
        )}
      </motion.div>
    </motion.div>
  );
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
  const usage = accountData?.usage ?? null;
  const { servers } = useServers();
  const { syncedServers, syncing, syncNow } = useSyncServers(servers, token, {
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
  const { displayUsed, displayLimit } = applyStorageDevOverride(storageUsed, storageLimit);
  const syncedCount = syncedServers.length;
  const backupsUrl = getWebsiteBackupsUrl();
  const firstServer = servers.length > 0 ? servers[0] : null;
  const firstServerName = firstServer?.name ?? null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <StatefulBackground running={false} />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {!isSignedIn ? (
          <HomeSignedOut
            t={t}
            showSignInPrompt={!!showSignInPrompt}
            onCreateServer={onCreateServer}
            onImportServer={onImportServer}
            onOpenAccount={onOpenAccount}
          />
        ) : (
          <div className="mx-auto w-full max-w-2xl flex-1 min-h-0 flex flex-col">
            <HomeSignedIn
              t={t}
              serverCount={serverCount}
              runningCount={runningCount}
              firstServerName={firstServerName}
              displayUsed={displayUsed}
              displayLimit={storageLimit !== null && storageLimit > 0 ? storageLimit : null}
              syncedCount={syncedCount}
              usage={usage}
              usageUnlimited={usageUnlimited}
              syncing={syncing}
              report={report}
              backupsUrl={backupsUrl}
              onGoToServers={onGoToServers}
              onCreateServer={onCreateServer}
              onImportServer={onImportServer}
              syncNow={syncNow}
              onGoToAi={onGoToAi}
              onOpenAccount={onOpenAccount}
            />
          </div>
        )}
      </div>
    </div>
  );
}
