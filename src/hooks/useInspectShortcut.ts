"use client";

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/utils";
import { useEffect } from "react";

function openDevTools() {
  if (isTauri()) invoke("open_devtools").catch(() => {});
}

export function useInspectShortcut(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  useEffect(() => {
    if (!enabled) return;
    const handleContextMenu = (e: MouseEvent) => {
      if (e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        openDevTools();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F12") {
        e.preventDefault();
        openDevTools();
      }
    };
    window.addEventListener("contextmenu", handleContextMenu, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("contextmenu", handleContextMenu, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [enabled]);
}
