"use client";

import NextLink from "next/link";
import { usePathname as useNextPathname, useRouter as useNextRouter } from "next/navigation";
import { useLocale } from "next-intl";
import type { ComponentProps } from "react";
import {
  getPath,
  getPathnameKeyFromCanonicalPath,
  pathToSegments,
  getPathnameKey,
  type PathnameKey,
  type Locale,
} from "./pathnames";
import { routing } from "./routing";

/** Convert logical href (e.g. "/pricing") to localized path for current locale */
function localizedHref(href: string, locale: Locale): string {
  const path = href.replace(/^\/|\/$/g, "");
  const key = getPathnameKeyFromCanonicalPath(path);
  if (key) return getPath(key, locale);
  return href;
}

export function usePathname(): string | null {
  return useNextPathname();
}

export function useRouter() {
  const router = useNextRouter();
  const locale = useLocale() as Locale;
  return {
    push: (href: string, options?: { scroll?: boolean }) => {
      const path = localizedHref(href, locale);
      router.push(path, options);
    },
    replace: (href: string, options?: { scroll?: boolean }) => {
      const path = localizedHref(href, locale);
      router.replace(path, options);
    },
    refresh: () => router.refresh(),
    back: () => router.back(),
    forward: () => router.forward(),
    prefetch: (href: string) => router.prefetch(localizedHref(href, locale)),
  };
}

type LinkProps = Omit<ComponentProps<typeof NextLink>, "href"> & {
  href: string;
  locale?: Locale;
};

export function Link({ href, locale: localeProp, ...rest }: LinkProps) {
  const locale = (localeProp ?? useLocale()) as Locale;
  const path = localizedHref(href, locale);
  return <NextLink href={path} {...rest} />;
}

export { routing };

/** Get pathname key for current path and locale (for language switcher) */
export function usePathnameKey(): PathnameKey | null {
  const pathname = useNextPathname();
  const locale = useLocale() as Locale;
  if (!pathname) return null;
  const segments = pathToSegments(pathname);
  return getPathnameKey(segments, locale);
}

/** Get localized path for a pathname key and locale (for switching language) */
export function getLocalizedPath(pathnameKey: PathnameKey, locale: Locale): string {
  return getPath(pathnameKey, locale);
}
