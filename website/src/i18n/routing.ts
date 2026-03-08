import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "de", "fr"],
  defaultLocale: "en",
  localePrefix: "never",
  localeDetection: true,
  // v4: cookie only set on switch; when set, persist 1 year (GDPR: inform users or set as needed)
  localeCookie: {
    maxAge: 60 * 60 * 24 * 365,
  },
});
