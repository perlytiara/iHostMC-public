"use client";

import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconBack,
  IconImportArrow,
  IconLoader,
  IconPlug,
  IconServerGlobe,
  IconSparkle,
} from "./ImportIcons";
export interface ServerPingResult {
  version_name: string;
  protocol_version: number;
  players_online: number;
  players_max: number;
  description: string;
  favicon_b64: string | null;
}

export type ImportPayload = {
  version: string;
  suggestedName: string;
  motd: string;
  favicon_b64: string | null;
};

interface ImportServerViewProps {
  onBack: () => void;
  onCreateWithImport: (payload: ImportPayload) => void;
}

export function ImportServerView({ onBack, onCreateWithImport }: ImportServerViewProps) {
  const { t } = useTranslation();
  const [host, setHost] = useState("");
  const [port, setPort] = useState("25565");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ServerPingResult | null>(null);
  const hostInputRef = useRef<HTMLInputElement>(null);

  const handlePing = useCallback(async () => {
    const h = host.trim();
    if (!h) {
      setError(t("import.enterAddress"));
      hostInputRef.current?.focus();
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const portNum = port.trim() ? parseInt(port.trim(), 10) : undefined;
      const validPort =
        portNum !== undefined &&
        !Number.isNaN(portNum) &&
        portNum >= 1 &&
        portNum <= 65535;
      if (port.trim() && !validPort) {
        setError(t("import.invalidPort"));
        setLoading(false);
        return;
      }
      const r = await invoke<ServerPingResult>("ping_minecraft_server", {
        host: h,
        port: portNum ?? undefined,
      });
      setResult(r);
    } catch (e) {
      const msg = String(e);
      const key = `import.error.${msg}`;
      const translated = t(key);
      setError(translated !== key ? translated : msg);
    } finally {
      setLoading(false);
    }
  }, [host, port, t]);

  const handleCreate = useCallback(() => {
    if (!result) return;
    const suggestedName = host.trim() ? `Import ${host.trim()}` : "Imported Server";
    onCreateWithImport({
      version: result.version_name,
      suggestedName,
      motd: result.description || "",
      favicon_b64: result.favicon_b64,
    });
  }, [result, host, onCreateWithImport]);

  useEffect(() => {
    hostInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        handleCreate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, handleCreate]);

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handlePing();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && result) {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-xl mx-auto min-h-0">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label={t("import.back")}
          className="shrink-0 rounded-xl"
        >
          <IconBack className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center justify-center size-9 rounded-xl bg-primary/10 text-primary shrink-0">
            <IconServerGlobe className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold truncate">{t("import.title")}</h2>
            <p className="text-xs text-muted-foreground truncate">
              {t("import.description")}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={onFormSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
          <div className="space-y-1.5">
            <label
              htmlFor="import-host"
              className="text-sm font-medium flex items-center gap-2 text-muted-foreground"
            >
              <IconPlug className="h-3.5 w-3.5" />
              {t("import.host")}
            </label>
            <input
              id="import-host"
              ref={hostInputRef}
              type="text"
              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              placeholder="play.example.com or 192.168.1.1"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={loading}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="import-port"
              className="text-sm font-medium text-muted-foreground"
            >
              {t("import.port")}
            </label>
            <input
              id="import-port"
              type="text"
              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              placeholder="25565"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
            {error}
          </p>
        )}

        <Button
          type="submit"
          onClick={handlePing}
          disabled={loading}
          className="w-full sm:w-auto gap-2 rounded-xl"
        >
          {loading ? (
            <IconLoader className="h-4 w-4" />
          ) : (
            <IconSparkle className="h-4 w-4" />
          )}
          {loading ? t("import.pinging") : t("import.ping")}
        </Button>
      </form>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-border bg-card overflow-hidden shadow-lg"
          >
            <div className="p-4 sm:p-5 space-y-4">
              <div className="flex items-start gap-4">
                {result.favicon_b64 ? (
                  <img
                    src={`data:image/png;base64,${result.favicon_b64}`}
                    alt=""
                    className="size-16 sm:size-20 rounded-xl border border-border bg-muted/50 shrink-0"
                  />
                ) : (
                  <div className="size-16 sm:size-20 rounded-xl border border-border bg-muted/50 flex items-center justify-center shrink-0">
                    <IconServerGlobe className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {t("import.version")}: {result.version_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("import.players")}: {result.players_online} / {result.players_max}
                  </p>
                  {result.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {t("import.motd")}: {result.description}
                    </p>
                  )}
                </div>
              </div>

              <Button
                onClick={handleCreate}
                className="w-full gap-2 rounded-xl py-5 text-base font-medium"
              >
                <IconImportArrow className="h-5 w-5" />
                {t("import.createWithVersion")}
                <span className="text-xs font-normal opacity-90 ml-1">
                  (Enter)
                </span>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
