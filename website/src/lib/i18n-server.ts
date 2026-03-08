import { cookies } from "next/headers";

const COOKIE_NAME = "NEXT_LOCALE";
const LOCALES = ["en", "de", "fr"] as const;
const DEFAULT_LOCALE = "en";

type Locale = (typeof LOCALES)[number];

/**
 * Resolve locale and load messages without using next-intl's getRequestConfig.
 * Use in layout and server components so the app works when the next-intl
 * plugin config cannot be resolved (e.g. with Next.js 16 Turbopack).
 */
export async function getLocaleAndMessages(): Promise<{
  locale: string;
  messages: Record<string, unknown>;
}> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(COOKIE_NAME)?.value;
  const locale: Locale =
    fromCookie && LOCALES.includes(fromCookie as Locale)
      ? (fromCookie as Locale)
      : DEFAULT_LOCALE;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
}

function getNested(
  obj: Record<string, unknown>,
  path: string
): string | undefined {
  const value = path.split(".").reduce<unknown>((acc, part) => {
    if (acc != null && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
  return typeof value === "string" ? value : undefined;
}

/**
 * Server-side translations that do not depend on next-intl's config file.
 * Use instead of getTranslations() from "next-intl/server" in server components
 * when running with Turbopack.
 */
export async function getServerTranslations(
  namespace: string
): Promise<(key: string) => string> {
  const { messages } = await getLocaleAndMessages();
  const section = messages[namespace] as Record<string, unknown> | undefined;
  return (key: string) => {
    if (!section) return key;
    const out = getNested(section as Record<string, unknown>, key);
    return out ?? key;
  };
}

/**
 * Server-side locale that does not depend on next-intl's config file.
 */
export async function getServerLocale(): Promise<string> {
  const { locale } = await getLocaleAndMessages();
  return locale;
}
