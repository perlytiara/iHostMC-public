"use client";

import * as React from "react";
import {
  getStoredDesignPalette,
  getStoredDesignStyle,
  setStoredDesignPalette,
  setStoredDesignStyle,
  type DesignPalette,
  type DesignStyle,
} from "@/lib/design";

interface DesignContextValue {
  style: DesignStyle;
  palette: DesignPalette;
  setStyle: (s: DesignStyle) => void;
  setPalette: (p: DesignPalette) => void;
}

const DesignContext = React.createContext<DesignContextValue | null>(null);

export function DesignProvider({ children }: { children: React.ReactNode }) {
  const [style, setStyleState] = React.useState<DesignStyle>(getStoredDesignStyle);
  const [palette, setPaletteState] = React.useState<DesignPalette>(getStoredDesignPalette);

  React.useLayoutEffect(() => {
    document.documentElement.setAttribute("data-design-style", style);
  }, [style]);

  React.useLayoutEffect(() => {
    document.documentElement.setAttribute("data-design-palette", palette);
  }, [palette]);

  const setStyle = React.useCallback((s: DesignStyle) => {
    setStyleState(s);
    setStoredDesignStyle(s);
  }, []);

  const setPalette = React.useCallback((p: DesignPalette) => {
    setPaletteState(p);
    setStoredDesignPalette(p);
  }, []);

  return (
    <DesignContext.Provider value={{ style, palette, setStyle, setPalette }}>
      {children}
    </DesignContext.Provider>
  );
}

export function useDesign() {
  const ctx = React.useContext(DesignContext);
  if (!ctx) throw new Error("useDesign must be used within DesignProvider");
  return ctx;
}
