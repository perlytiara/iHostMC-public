"use client";

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/utils";
import { useEffect } from "react";

export function useInspectShortcut() {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        if (isTauri()) invoke("open_devtools").catch(() => {});
      }
    };
    window.addEventListener("contextmenu", handleContextMenu, true);
    return () => window.removeEventListener("contextmenu", handleContextMenu, true);
  }, []);
}
