"use client";

import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { Search, Download, ExternalLink } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "@/lib/toast-store";
import type { ModrinthHit, SpigetResource } from "../types";

interface BrowseModsPluginsProps {
  serverId: string | null;
  gameVersion: string;
  onClose: () => void;
}

export function BrowseModsPlugins({ serverId, gameVersion, onClose }: BrowseModsPluginsProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"mods" | "plugins">("mods");
  const [query, setQuery] = useState("");
  const [modrinthMods, setModrinthMods] = useState<ModrinthHit[]>([]);
  const [modrinthPlugins, setModrinthPlugins] = useState<ModrinthHit[]>([]);
  const [spigetPlugins, setSpigetPlugins] = useState<SpigetResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);

  const searchMods = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const hits = await invoke<ModrinthHit[]>("search_modrinth_mods", {
        query: query.trim(),
        gameVersion: gameVersion || undefined,
        loaders: ["fabric"],
        limit: 20,
      });
      setModrinthMods(hits);
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
      toast.error(t("mods.searchError"));
    } finally {
      setLoading(false);
    }
  }, [query, gameVersion, t]);

  const searchPlugins = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const [modrinth, spiget] = await Promise.all([
        invoke<ModrinthHit[]>("search_modrinth_plugins", {
          query: query.trim(),
          gameVersion: gameVersion || undefined,
          limit: 15,
        }),
        invoke<SpigetResource[]>("search_spiget_plugins", { query: query.trim(), size: 15 }),
      ]);
      setModrinthPlugins(modrinth);
      setSpigetPlugins(spiget);
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
      toast.error(t("mods.searchError"));
    } finally {
      setLoading(false);
    }
  }, [query, gameVersion, t]);

  const installMod = useCallback(
    async (slug: string) => {
      if (!serverId) return;
      setInstalling(slug);
      try {
        await invoke("install_modrinth_mod", {
          serverId,
          projectSlug: slug,
          gameVersion,
        });
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
        toast.error(t("mods.searchError"));
      } finally {
        setInstalling(null);
      }
    },
    [serverId, gameVersion, t]
  );

  const installPluginModrinth = useCallback(
    async (slug: string) => {
      if (!serverId) return;
      setInstalling(slug);
      try {
        await invoke("install_modrinth_plugin", {
          serverId,
          projectSlug: slug,
          gameVersion,
        });
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
        toast.error(t("mods.searchError"));
      } finally {
        setInstalling(null);
      }
    },
    [serverId, gameVersion, t]
  );

  const installPluginSpiget = useCallback(
    async (id: number, premium: boolean) => {
      if (premium) {
        window.open(`https://www.spigotmc.org/resources/${id}`, "_blank");
        return;
      }
      if (!serverId) return;
      setInstalling(String(id));
      try {
        await invoke("install_spiget_plugin", { serverId, resourceId: id });
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
        toast.error(t("mods.searchError"));
      } finally {
        setInstalling(null);
      }
    },
    [serverId, t]
  );

  const modsEmpty = tab === "mods" && query.trim() && !modrinthMods.length;
  const pluginsEmpty =
    tab === "plugins" && query.trim() && !modrinthPlugins.length && !spigetPlugins.length;

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("mods.browseTitle")}</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t("common.close")}
        </Button>
      </div>
      {!serverId && (
        <p className="mb-2 text-sm text-muted-foreground">{t("mods.selectServer")}</p>
      )}
      <div className="mb-2 flex gap-2">
        <div className="flex flex-1 gap-2">
          <input
            className="flex-1 rounded border border-input bg-background px-3 py-2 text-sm"
            placeholder={t("mods.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (tab === "mods" ? searchMods() : searchPlugins())}
          />
          <Button size="icon" variant="secondary" onClick={tab === "mods" ? searchMods : searchPlugins}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="mb-2 flex gap-1 border-b border-border">
        <button
          type="button"
          className={`px-3 py-2 text-sm ${tab === "mods" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
          onClick={() => setTab("mods")}
        >
          {t("mods.modsTab")}
        </button>
        <button
          type="button"
          className={`px-3 py-2 text-sm ${tab === "plugins" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
          onClick={() => setTab("plugins")}
        >
          {t("mods.pluginsTab")}
        </button>
      </div>
      <div className="min-h-[200px] flex-1 overflow-y-auto">
        {loading && <p className="text-sm text-muted-foreground">{t("mods.loading")}</p>}
        {!loading && modsEmpty && <p className="text-sm text-muted-foreground">{t("mods.noResults")}</p>}
        {!loading && pluginsEmpty && <p className="text-sm text-muted-foreground">{t("mods.noResults")}</p>}
        {tab === "mods" && !modsEmpty && (
          <ul className="space-y-2">
            {modrinthMods.map((m) => (
              <li key={m.slug} className="flex items-center justify-between rounded border border-border p-2">
                <div>
                  <p className="font-medium">{m.title}</p>
                  {m.description && (
                    <p className="line-clamp-1 text-xs text-muted-foreground">{m.description}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  disabled={!serverId || installing === m.slug}
                  onClick={() => installMod(m.slug)}
                >
                  {installing === m.slug ? "…" : <Download className="h-4 w-4" />}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {tab === "plugins" && !pluginsEmpty && (
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t("mods.modrinthPlugins")}</p>
              <ul className="space-y-2">
                {modrinthPlugins.map((m) => (
                  <li key={m.slug} className="flex items-center justify-between rounded border border-border p-2">
                    <span className="font-medium">{m.title}</span>
                    <Button
                      size="sm"
                      disabled={!serverId || installing === m.slug}
                      onClick={() => installPluginModrinth(m.slug)}
                    >
                      {installing === m.slug ? "…" : <Download className="h-4 w-4" />}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t("mods.spigotPlugins")}</p>
              <ul className="space-y-2">
                {spigetPlugins.map((r) => {
                  const premium = r.premium ?? false;
                  return (
                    <li key={r.id} className="flex items-center justify-between rounded border border-border p-2">
                      <span className="font-medium">{r.name}</span>
                      {premium ? (
                        <Button size="sm" variant="outline" asChild>
                          <a href={`https://www.spigotmc.org/resources/${r.id}`} target="_blank" rel="noreferrer">
                            {t("mods.premiumSpigot")} <ExternalLink className="ml-1 h-3 w-3" />
                          </a>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={!serverId || installing === String(r.id)}
                          onClick={() => installPluginSpiget(r.id, premium)}
                        >
                          {installing === String(r.id) ? "…" : <Download className="h-4 w-4" />}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
