"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner, LoadingState } from "@/components/LoadingSpinner";
import {
  getWebsiteUrl,
  getWebsiteSignupUrl,
  getLoginUrlWithSession,
  getApiBaseUrl,
  claimAppSession,
} from "@/lib/api-client";
import { useAuthStore } from "../store/auth-store";
import { isTauri } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { UserPlus, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

type ConnectPhase = "idle" | "opening" | "waiting" | "error";

interface AccountConnectProps {
  onSuccess?: () => void;
  /** When true, show compact layout (e.g. inside settings card) */
  compact?: boolean;
  /** Called before setUser so app can navigate to settings and avoid a blank screen */
  onBeforeLogin?: () => void;
}

export function AccountConnect({ onSuccess, compact, onBeforeLogin }: AccountConnectProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [phase, setPhase] = useState<ConnectPhase>("idle");
  const [waitingSessionId, setWaitingSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const pollStartedRef = useRef<number | null>(null);

  // When user is set (e.g. via deep link / browser sign-in handoff), parent shows account card; reset local state
  useEffect(() => {
    if (user) {
      setPhase("idle");
      setWaitingSessionId(null);
      pollStartedRef.current = null;
      onSuccess?.();
    }
  }, [user, onSuccess]);

  // Poll backend for session token when waiting (verified through website)
  useEffect(() => {
    if (phase !== "waiting" || !waitingSessionId?.trim()) return;
    const sessionId = waitingSessionId;
    pollStartedRef.current ??= Date.now();

    const tryClaim = async (): Promise<void> => {
      if (Date.now() - (pollStartedRef.current ?? 0) > POLL_TIMEOUT_MS) {
        setPhase("idle");
        setWaitingSessionId(null);
        pollStartedRef.current = null;
        return;
      }
      const auth = await claimAppSession(sessionId);
      if (auth) {
        onBeforeLogin?.();
        setTimeout(() => {
          setUser({ token: auth.token, userId: auth.userId, email: auth.email });
          setPhase("idle");
          setWaitingSessionId(null);
          pollStartedRef.current = null;
          onSuccess?.();
        }, 0);
      }
    };

    tryClaim(); // poll once immediately
    const interval = setInterval(tryClaim, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [phase, waitingSessionId, setUser, onSuccess]);

  const websiteUrl = getWebsiteUrl();
  const apiBase = getApiBaseUrl();
  const signupUrl = getWebsiteSignupUrl();

  const openBrowser = useCallback((url: string) => {
    if (!url) return;
    setPhase("opening");
    try {
      if (isTauri()) {
        import("@tauri-apps/plugin-shell").then(({ open }) => open(url));
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    setPhase("waiting");
  }, []);

  const handleSignInWithBrowser = useCallback(async () => {
    setSessionError(null);
    setPhase("opening");
    try {
      const result = await getLoginUrlWithSession();
      if (result) {
        setWaitingSessionId(result.sessionId);
        pollStartedRef.current = null;
        openBrowser(result.url);
      } else {
        setPhase("error");
        setSessionError(apiBase ? "couldNotCreateLink" : "couldNotCreateLinkNoApi");
      }
    } catch {
      setPhase("error");
      setSessionError(apiBase ? "couldNotCreateLink" : "couldNotCreateLinkNoApi");
    }
  }, [openBrowser, apiBase]);

  const handleSignUp = useCallback(async () => {
    await openBrowser(signupUrl);
  }, [signupUrl, openBrowser]);

  if (!apiBase) {
    return (
      <div className={cn("rounded-xl border border-border bg-card/50 p-6 text-center", compact && "p-4")}>
        <p className="text-sm text-muted-foreground">{t("settings.backendNotConfigured")}</p>
      </div>
    );
  }

  if (!websiteUrl) {
    return (
      <div className={cn("rounded-xl border border-border bg-card/50 p-6 text-center", compact && "p-4")}>
        <p className="text-sm text-muted-foreground">{t("settings.websiteUrlNotSet")}</p>
      </div>
    );
  }

  if (phase === "opening") {
    return (
      <div className={cn("rounded-xl border-2 border-border bg-card/50 p-8", compact && "p-6")}>
        <LoadingState message={t("settings.openingBrowser")} />
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className={cn("rounded-xl border-2 border-border bg-card/50 p-6", compact && "p-4")}>
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner className="h-12 w-12" />
          <p className="text-sm font-medium text-muted-foreground text-center">
            {t("settings.waitingForSignIn")}
          </p>
          <p className="text-xs text-muted-foreground text-center max-w-sm">
            {t("settings.signInAtWebsite", { url: websiteUrl })}
          </p>
          <p className="text-xs text-muted-foreground/80 text-center max-w-sm">
            {t("settings.returnToAppHint")}
          </p>
          <Button variant="outline" onClick={() => setPhase("idle")}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "error" && sessionError) {
    const isNoApi = sessionError === "couldNotCreateLinkNoApi";
    return (
      <div className={cn("rounded-xl border-2 border-destructive/40 bg-card/50 p-6", compact && "p-4")}>
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm font-medium text-destructive">
            {t(isNoApi ? "settings.backendNotConfigured" : "settings.couldNotCreateLink")}
          </p>
          <p className="text-xs text-muted-foreground max-w-sm">
            {isNoApi
              ? t("settings.websiteUrlNotSet")
              : t("settings.couldNotCreateLinkHint")}
          </p>
          {apiBase && (
            <p className="text-xs text-muted-foreground/80 font-mono break-all max-w-sm">
              {apiBase}
            </p>
          )}
          <Button onClick={() => { setPhase("idle"); setSessionError(null); }}>
            {t("common.tryAgain")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={cn("rounded-xl border-2 border-border bg-card/50 p-6", compact && "p-4")}>
        <p className="text-sm text-muted-foreground mb-4 text-center">
          {t("settings.accountConnectHint")}
        </p>
      <div className={cn("flex flex-col gap-3", compact ? "sm:flex-row" : "sm:flex-row sm:justify-center")}>
        <Button onClick={handleSignInWithBrowser} className="gap-2 min-w-[180px] justify-center" size={compact ? "default" : "lg"}>
          <LogIn className="h-4 w-4" />
          {t("settings.signInWithBrowser")}
        </Button>
        <Button onClick={handleSignUp} variant="outline" className="gap-2 min-w-[180px] justify-center" size={compact ? "default" : "lg"}>
          <UserPlus className="h-4 w-4" />
          {t("settings.signUp")}
        </Button>
      </div>
        <p className="mt-3 text-xs text-muted-foreground text-center">
          {t("settings.accountConnectFooterAuto")}
        </p>
      </div>
    </>
  );
}
