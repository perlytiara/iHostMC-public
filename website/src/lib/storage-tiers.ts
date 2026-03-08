/**
 * Storage included with subscription tier (not add-ons). Free 5GB, Backup 15GB, Pro 100GB.
 * Used for display; actual limits from API report.
 */
export interface StorageTier {
  id: string;
  label: string;
  sizeGb: number;
  priceUsdPerMonth: number;
  description: string;
}

/** Storage included per plan (free / backup / pro). */
export const TIER_STORAGE: Record<string, { sizeGb: number; label: string }> = {
  free: { sizeGb: 5, label: "5 GB free" },
  backup: { sizeGb: 15, label: "15 GB" },
  pro: { sizeGb: 100, label: "100 GB" },
};

/** Legacy add-on tiers (minimized in UI; keep for reference). */
export const STORAGE_TIERS: StorageTier[] = [
  { id: "5", label: "5 GB", sizeGb: 5, priceUsdPerMonth: 0, description: "Free tier" },
  { id: "15", label: "15 GB", sizeGb: 15, priceUsdPerMonth: 3.99, description: "Backup plan" },
  { id: "100", label: "100 GB", sizeGb: 100, priceUsdPerMonth: 11.99, description: "Pro plan" },
];

export function formatStorageTierPrice(priceUsd: number, locale: string): string {
  const lang = (locale || "en").split("-")[0];
  if (lang === "de" || lang === "fr") return `${priceUsd}€/mo`;
  return `$${priceUsd}/mo`;
}
