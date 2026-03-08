"use client";

import { useState, useCallback, useEffect } from "react";
import { RefreshCw, Link2, Info } from "lucide-react";

type Position = { x: number; y: number } | null;

export function AppContextMenu({ children }: { children: React.ReactNode }) {
  const [pos, setPos] = useState<Position>(null);

  const close = useCallback(() => setPos(null), []);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-context-menu-skip]")) return;
      if (e.shiftKey) return;
      e.preventDefault();
      setPos({ x: e.clientX, y: e.clientY });
    };
    const handleClick = () => close();
    const handleScroll = () => close();
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("click", handleClick);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [close]);

  const handleReload = () => {
    window.location.reload();
    close();
  };
  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => close());
  };

  return (
    <>
      {children}
      {pos && (
        <div
          className="fixed z-[9999] min-w-[180px] rounded-lg border border-border bg-popover py-1 shadow-lg"
          style={{ left: pos.x, top: pos.y }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            onClick={handleReload}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reload
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            onClick={handleCopyLink}
          >
            <Link2 className="h-3.5 w-3.5" />
            Copy link
          </button>
          <div className="mt-1 border-t border-border px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
            <Info className="h-3 w-3" />
            Shift + right-click for browser menu
          </div>
        </div>
      )}
    </>
  );
}
