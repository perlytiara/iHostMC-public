/**
 * Single source of truth for product identity. Keep in sync with the desktop app
 * (e.g. app window title, about screen, or locales) so website and app feel consistent.
 */
export const BRAND = {
  /** Product name shown in header, footer, meta. */
  appName: "iHost",
  /** Short tagline for meta and hero. */
  tagline: "Host games. Start with Minecraft.",
  /** Default theme: "dark" | "light". Discord-style = dark first. */
  defaultTheme: "dark" as const,
  /** GitHub repo for Star / Contribute links. */
  githubRepo: "https://github.com/perlytiara/iHostMC",
} as const;
