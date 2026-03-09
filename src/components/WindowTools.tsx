"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  X,
  Monitor,
  Maximize2,
  Minimize2,
  Move,
  Sparkles,
  Activity,
  Ruler,
  LayoutGrid,
} from "lucide-react";
import { cn, isTauri } from "@/lib/utils";
import {
  getCurrentWindow,
  currentMonitor,
  LogicalSize,
} from "@tauri-apps/api/window";

interface WindowToolsProps {
  open: boolean;
  onClose: () => void;
}

interface WindowInfo {
  innerW: number;
  innerH: number;
  outerW: number;
  outerH: number;
  scale: number;
  monitorW: number;
  monitorH: number;
  posX: number;
  posY: number;
  isMaximized: boolean;
}

const PRESETS: { labelKey: string; w: number; h: number; icon: typeof Minimize2 }[] = [
  { labelKey: "tools.presetCompact", w: 900, h: 600, icon: Minimize2 },
  { labelKey: "tools.presetDefault", w: 1280, h: 800, icon: LayoutGrid },
  { labelKey: "tools.presetWide", w: 1600, h: 900, icon: Maximize2 },
  { labelKey: "tools.presetTall", w: 1100, h: 1000, icon: Move },
];

const DANCE_KEYFRAMES = [
  { w: 950, h: 650, dur: 120 },
  { w: 1400, h: 700, dur: 100 },
  { w: 1100, h: 900, dur: 110 },
  { w: 800, h: 750, dur: 100 },
  { w: 1300, h: 650, dur: 110 },
  { w: 1050, h: 850, dur: 100 },
  { w: 1200, h: 750, dur: 120 },
  { w: 1280, h: 800, dur: 200 },
];

export function WindowTools({ open, onClose }: WindowToolsProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<WindowInfo | null>(null);
  const [dancing, setDancing] = useState(false);
  const [danceStep, setDanceStep] = useState(-1);
  const [resizeLog, setResizeLog] = useState<string[]>([]);
  const cancelRef = useRef(false);

  const refreshInfo = useCallback(async () => {
    if (!isTauri()) {
      setInfo({
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        outerW: window.outerWidth,
        outerH: window.outerHeight,
        scale: window.devicePixelRatio,
        monitorW: screen.width,
        monitorH: screen.height,
        posX: window.screenX,
        posY: window.screenY,
        isMaximized: false,
      });
      return;
    }
    try {
      const win = getCurrentWindow();
      const [inner, outer, factor, pos, mon, maximized] = await Promise.all([
        win.innerSize(),
        win.outerSize(),
        win.scaleFactor(),
        win.outerPosition(),
        currentMonitor(),
        win.isMaximized(),
      ]);
      setInfo({
        innerW: Math.round(inner.width / factor),
        innerH: Math.round(inner.height / factor),
        outerW: Math.round(outer.width / factor),
        outerH: Math.round(outer.height / factor),
        scale: factor,
        monitorW: mon ? Math.round(mon.size.width / mon.scaleFactor) : screen.width,
        monitorH: mon ? Math.round(mon.size.height / mon.scaleFactor) : screen.height,
        posX: Math.round(pos.x / factor),
        posY: Math.round(pos.y / factor),
        isMaximized: maximized,
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    refreshInfo();
    const id = setInterval(refreshInfo, 500);
    return () => clearInterval(id);
  }, [open, refreshInfo]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", handleEsc);
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("keydown", handleEsc);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [open, onClose]);

  const log = useCallback((msg: string) => {
    setResizeLog((prev) => [...prev.slice(-19), `${new Date().toLocaleTimeString()} ${msg}`]);
  }, []);

  const resizeTo = useCallback(
    async (w: number, h: number, label?: string) => {
      if (!isTauri()) return;
      try {
        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(w, h));
        log(label ? `→ ${label} (${w}×${h})` : `→ ${w}×${h}`);
      } catch {
        log(`✗ resize failed`);
      }
    },
    [log]
  );

  const startDance = useCallback(async () => {
    if (!isTauri() || dancing) return;
    setDancing(true);
    cancelRef.current = false;
    log("▶ Dance started");
    const win = getCurrentWindow();

    for (let i = 0; i < DANCE_KEYFRAMES.length; i++) {
      if (cancelRef.current) break;
      const kf = DANCE_KEYFRAMES[i];
      setDanceStep(i);
      try {
        await win.setSize(new LogicalSize(kf.w, kf.h));
        await win.center();
      } catch {
        /* ignore */
      }
      log(`♫ Step ${i + 1}/${DANCE_KEYFRAMES.length} → ${kf.w}×${kf.h}`);
      await new Promise((r) => setTimeout(r, kf.dur));
    }

    setDanceStep(-1);
    setDancing(false);
    log(cancelRef.current ? "⏹ Dance cancelled" : "✓ Dance complete");
  }, [dancing, log]);

  const stopDance = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const fitToScreen = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const win = getCurrentWindow();
      const mon = await currentMonitor();
      if (!mon) return;
      const scale = mon.scaleFactor;
      const w = Math.round((mon.size.width / scale) * 0.9);
      const h = Math.round((mon.size.height / scale) * 0.9);
      await win.setSize(new LogicalSize(w, h));
      await win.center();
      log(`→ Fit to screen (${w}×${h})`);
    } catch {
      log("✗ fit failed");
    }
  }, [log]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      >
        <motion.div
          ref={panelRef}
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Monitor className="h-4 w-4 text-primary" />
              {t("tools.title")}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* Live dimensions */}
            <section>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Ruler className="h-3.5 w-3.5" />
                {t("tools.dimensions")}
              </h3>
              {info ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Stat label={t("tools.innerSize")} value={`${info.innerW} × ${info.innerH}`} />
                  <Stat label={t("tools.outerSize")} value={`${info.outerW} × ${info.outerH}`} />
                  <Stat label={t("tools.position")} value={`${info.posX}, ${info.posY}`} />
                  <Stat label={t("tools.scale")} value={`${info.scale.toFixed(2)}x`} />
                  <Stat label={t("tools.monitor")} value={`${info.monitorW} × ${info.monitorH}`} />
                  <Stat
                    label={t("tools.maximized")}
                    value={info.isMaximized ? "Yes" : "No"}
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("tools.loading")}</p>
              )}
            </section>

            {/* Resize presets */}
            {isTauri() && (
              <section>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  {t("tools.presets")}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {PRESETS.map((p) => {
                    const Icon = p.icon;
                    const isActive =
                      info && info.innerW === p.w && info.innerH === p.h;
                    return (
                      <button
                        key={p.labelKey}
                        type="button"
                        onClick={() => resizeTo(p.w, p.h, t(p.labelKey))}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:border-primary/50 hover:bg-accent/40",
                          isActive
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-foreground"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1 text-left">{t(p.labelKey)}</span>
                        <span className="text-muted-foreground text-[10px]">
                          {p.w}×{p.h}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={fitToScreen}
                  className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:border-primary/50 hover:bg-accent/40 transition-all"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  {t("tools.fitToScreen")}
                </button>
              </section>
            )}

            {/* Resize dance */}
            {isTauri() && (
              <section>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("tools.danceTitle")}
                </h3>
                <p className="text-xs text-muted-foreground mb-2">
                  {t("tools.danceDesc")}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={dancing ? stopDance : startDance}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                      dancing
                        ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    <Sparkles
                      className={cn("h-4 w-4", dancing && "animate-spin")}
                    />
                    {dancing ? t("tools.danceStop") : t("tools.danceStart")}
                  </button>
                </div>
                {dancing && danceStep >= 0 && (
                  <div className="mt-2 flex gap-1">
                    {DANCE_KEYFRAMES.map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1.5 flex-1 rounded-full transition-colors duration-150",
                          i <= danceStep ? "bg-primary" : "bg-muted"
                        )}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Debug log */}
            <section>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                {t("tools.debugLog")}
              </h3>
              <div className="rounded-lg border border-border bg-muted/30 p-2 max-h-32 overflow-y-auto font-mono text-[11px] text-muted-foreground">
                {resizeLog.length === 0 ? (
                  <span className="italic">{t("tools.noActivity")}</span>
                ) : (
                  resizeLog.map((line, i) => (
                    <div key={i} className="leading-relaxed">
                      {line}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium text-foreground">{value}</span>
    </div>
  );
}
