export type DesignStyle = "simple" | "standard";
export type DesignPalette = "monochrome" | "colorful";

const STORAGE_KEY_STYLE = "ihostmc-design-style";
const STORAGE_KEY_PALETTE = "ihostmc-design-palette";

export function getStoredDesignStyle(): DesignStyle {
  if (typeof localStorage === "undefined") return "simple";
  const v = localStorage.getItem(STORAGE_KEY_STYLE);
  return v === "standard" ? "standard" : "simple";
}

export function getStoredDesignPalette(): DesignPalette {
  if (typeof localStorage === "undefined") return "monochrome";
  const v = localStorage.getItem(STORAGE_KEY_PALETTE);
  return v === "colorful" ? "colorful" : "monochrome";
}

export function setStoredDesignStyle(value: DesignStyle): void {
  localStorage.setItem(STORAGE_KEY_STYLE, value);
}

export function setStoredDesignPalette(value: DesignPalette): void {
  localStorage.setItem(STORAGE_KEY_PALETTE, value);
}

export function getDesignLabel(style: DesignStyle, palette: DesignPalette): string {
  const styleLabel = style === "simple" ? "Einfach" : "Standard";
  const paletteLabel = palette === "monochrome" ? "Monochrom" : "Mehrfarbig";
  return `${styleLabel} · ${paletteLabel}`;
}
