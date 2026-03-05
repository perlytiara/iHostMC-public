"use client";

import { useCallback, useEffect, useRef } from "react";

export function useDevMenuShortcut(onOpen: () => void) {
  const keysRef = useRef<Set<string>>(new Set());

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (import.meta.env.VITE_PUBLIC_REPO === "true") return;
      if (!e.ctrlKey || !e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === "d") {
        e.preventDefault();
        onOpen();
        return;
      }
      if (key === "1" || key === "2") {
        e.preventDefault();
        keysRef.current.add(key);
        if (keysRef.current.has("1") && keysRef.current.has("2")) {
          onOpen();
          keysRef.current.clear();
        }
      }
    },
    [onOpen]
  );

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    keysRef.current.delete(e.key.toLowerCase());
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);
}
