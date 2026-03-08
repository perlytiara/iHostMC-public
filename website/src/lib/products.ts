/**
 * Product/game slugs for URLs and display. Used for server and backup routes
 * (e.g. /dashboard/servers/minecraft/xxx) and product pages.
 */
export interface ProductSlug {
  slug: string;
  name: string;
  /** Short label for nav/cards */
  shortName?: string;
}

export const PRODUCT_SLUGS: ProductSlug[] = [
  { slug: "minecraft", name: "Minecraft", shortName: "MC" },
  { slug: "garrys-mod", name: "Garry's Mod", shortName: "GMod" },
  { slug: "rust", name: "Rust" },
  { slug: "valheim", name: "Valheim" },
  { slug: "terraria", name: "Terraria" },
  { slug: "ark", name: "ARK: Survival Evolved" },
  { slug: "7-days-to-die", name: "7 Days to Die" },
  { slug: "palworld", name: "Palworld" },
];

const slugSet = new Set(PRODUCT_SLUGS.map((p) => p.slug));

export function isValidProductSlug(slug: string): boolean {
  return slugSet.has(slug);
}

export function getProductBySlug(slug: string): ProductSlug | undefined {
  return PRODUCT_SLUGS.find((p) => p.slug === slug);
}

export const DEFAULT_PRODUCT_SLUG = "minecraft";
