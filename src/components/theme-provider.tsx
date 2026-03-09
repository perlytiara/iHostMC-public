import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const THEMES = [
  { id: "light", label: "Light", isDark: false },
  { id: "dark", label: "Dark", isDark: true },
  { id: "ocean", label: "Ocean", isDark: false },
  { id: "forest", label: "Forest", isDark: false },
  { id: "sunset", label: "Sunset", isDark: false },
  { id: "midnight", label: "Midnight", isDark: true },
  { id: "neon", label: "Neon", isDark: true },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  isDark: true,
});

function getStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem("ihostmc-theme") as ThemeId | null;
    if (v && THEMES.some((t) => t.id === v)) return v;
  } catch {}
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(getStoredTheme);

  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    localStorage.setItem("ihostmc-theme", t);
  };

  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("data-theme", theme);
    const meta = THEMES.find((t) => t.id === theme);
    if (meta?.isDark) {
      el.classList.add("dark");
    } else {
      el.classList.remove("dark");
    }
  }, [theme]);

  const isDark = THEMES.find((t) => t.id === theme)?.isDark ?? false;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
