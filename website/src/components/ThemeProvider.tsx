"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeId = "system" | "light" | "dark";

const STORAGE_KEY = "ihostmc-theme";

function getStoredTheme(): ThemeId {
  if (typeof window === "undefined") return "dark";
  try {
    const v = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (v === "system" || v === "light" || v === "dark") return v;
  } catch {}
  return "dark";
}

function getResolvedDark(): boolean {
  if (typeof window === "undefined") return true;
  const theme = getStoredTheme();
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  resolvedDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  resolvedDark: true,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("dark");
  const [resolvedDark, setResolvedDark] = useState(true);

  useEffect(() => {
    setThemeState(getStoredTheme());
    setResolvedDark(getResolvedDark());
  }, []);

  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {}
    const dark =
      t === "dark" ? true : t === "light" ? false : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setResolvedDark(dark);
  };

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme === "system" ? (resolvedDark ? "dark" : "light") : theme);
    if (resolvedDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme, resolvedDark]);

  useEffect(() => {
    if (theme !== "system") return;
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setResolvedDark(m.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
