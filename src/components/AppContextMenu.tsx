"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { RefreshCw, Link2, Info } from "lucide-react";

/**
 * Global right-click context menu. Shift + right-click shows browser default menu.
 * Skips when right-clicking on elements with data-context-menu (e.g. server list row).
 */
export function AppContextMenu() {
  const { t } = useTranslation();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (e.shiftKey) return;
      const target = e.target as Element;
      if (target.closest?.("[data-context-menu-skip]")) return;
      if (target.closest?.("[data-context-menu]")) return;
      e.preventDefault();
      setPosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("contextmenu", handleContextMenu, true);
    return () => window.removeEventListener("contextmenu", handleContextMenu, true);
  }, []);

  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", handleClickOutside, true);
    window.addEventListener("keydown", handleEscape, true);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside, true);
      window.removeEventListener("keydown", handleEscape, true);
    };
  }, [position]);

  const handleReload = () => {
    setPosition(null);
    window.location.reload();
  };
  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => setPosition(null));
  };

  if (!position) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[180px] rounded-lg border border-border bg-card py-1 text-card-foreground shadow-xl backdrop-blur-sm"
      style={{ left: position.x, top: position.y }}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        onClick={handleReload}
      >
        <RefreshCw className="h-3.5 w-3.5 shrink-0" />
        {t("menu.refresh")}
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        onClick={handleCopyLink}
      >
        <Link2 className="h-3.5 w-3.5 shrink-0" />
        Copy link
      </button>
      <div className="mt-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Info className="h-3 w-3 shrink-0" />
        Shift + right-click for browser menu
      </div>
    </div>,
    document.body
  );
}
