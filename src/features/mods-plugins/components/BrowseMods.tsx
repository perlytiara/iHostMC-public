"use client";

import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { Search, Download, Loader2, Package } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ModrinthHit, CurseForgeHit } from "../types";

interface BrowseModsProps {
  serverId: string;
  gameVersion: string;
  serverType: string;
}

type Source = "modrinth" | "curseforge";

export function BrowseMods({ serverId, gameVersion, serverType }: BrowseModsProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source>("modrinth");
  const [modrinthResults, setModrinthResults] = useState<ModrinthHit[]>([]);
  const [curseforgeResults, setCurseforgeResults] = useState<CurseForgeHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loaders = serverType === "fabric" ? ["fabric"] : serverType === "forge" ? ["forge"] : serverType === "neoforge" ? ["neoforge"] : ["fabric", "forge", "neoforge"];

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      if (source === "modrinth") {
        const hits = await invoke<ModrinthHit[]>("search_modrinth_mods", {
          query: query.trim(),
          gameVersion: gameVersion || undefined,
          loaders,
          limit: 20,
        });
        setModrinthResults(hits);
      } else {
        const hits = await invoke<CurseForgeHit[]>("search_curseforge_mods", {
          query: query.trim(),
          gameVersion: gameVersion || undefined,
          limit: 20,
        });
        setCurseforgeResults(hits);
      }
    } catch (e) {
      const msg = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [query, gameVersion, source, loaders]);

  const installModrinth = useCallback(async (slug: string) => {
    setInstalling(slug);
    try {
      await invoke("install_modrinth_mod", { serverId, projectSlug: slug, gameVersion });
    } catch (e) {
      console.error(e);
    } finally {
      setInstalling(null);
    }
  }, [serverId, gameVersion]);

  const installCurseforge = useCallback(async (modId: number) => {
    setInstalling(String(modId));
    try {
      await invoke("install_curseforge_mod", { serverId, modId, gameVersion });
    } catch (e) {
      console.error(e);
    } finally {
      setInstalling(null);
    }
  }, [serverId, gameVersion]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-2">
          <input
            className={cn(
              "flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            )}
            placeholder={t("mods.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <Button size="icon" variant="secondary" onClick={search} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex gap-1">
        {(["modrinth", "curseforge"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              source === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            )}
            onClick={() => setSource(s)}
          >
            {s === "modrinth" ? "Modrinth" : "CurseForge"}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {source === "modrinth" ? (
          modrinthResults.length === 0 && !loading ? (
            <EmptyState message={t("mods.searchHint")} />
          ) : (
            <ul className="space-y-2">
              {modrinthResults.map((m) => (
                <li key={m.slug} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/30">
                  {m.icon_url ? (
                    <img src={m.icon_url} alt="" className="h-10 w-10 rounded-md object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted"><Package className="h-5 w-5 text-muted-foreground" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{m.title}</p>
                    {m.description && <p className="text-xs text-muted-foreground line-clamp-1">{m.description}</p>}
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5 shrink-0" disabled={installing === m.slug} onClick={() => installModrinth(m.slug)}>
                    {installing === m.slug ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    {t("mods.install")}
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : (
          curseforgeResults.length === 0 && !loading ? (
            <EmptyState message={t("mods.searchHint")} />
          ) : (
            <ul className="space-y-2">
              {curseforgeResults.map((m) => (
                <li key={m.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/30">
                  {m.logo?.thumbnailUrl ? (
                    <img src={m.logo.thumbnailUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted"><Package className="h-5 w-5 text-muted-foreground" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{m.name}</p>
                    {m.summary && <p className="text-xs text-muted-foreground line-clamp-1">{m.summary}</p>}
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5 shrink-0" disabled={installing === String(m.id)} onClick={() => installCurseforge(m.id)}>
                    {installing === String(m.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    {t("mods.install")}
                  </Button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Package className="h-10 w-10 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
