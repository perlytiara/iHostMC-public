import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import de from "@/locales/de.json";
import fr from "@/locales/fr.json";

const STORAGE_KEY = "ihostmc-locale";

function getDefaultLanguage(): string {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  if (!nav) return "en";
  const code = nav.split("-")[0].toLowerCase();
  if (code === "de") return "de";
  if (code === "fr") return "fr";
  return "en";
}

export const supportedLngs = ["en", "de", "fr"] as const;
export type SupportedLng = (typeof supportedLngs)[number];

/** Awaited in main.tsx before first render so no component suspends on useTranslation(). */
export const i18nReady = i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, de: { translation: de }, fr: { translation: fr } },
  lng: getDefaultLanguage(),
  fallbackLng: "en",
  supportedLngs: [...supportedLngs],
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

i18n.on("languageChanged", (lng) => {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, lng);
});

export function setLocale(lng: string): void {
  i18n.changeLanguage(supportedLngs.includes(lng as SupportedLng) ? lng : "en");
}

export default i18n;
