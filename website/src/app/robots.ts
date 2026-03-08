import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ihost.one";
const underConstruction = process.env.NEXT_PUBLIC_SITE_UNDER_CONSTRUCTION !== "false";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: underConstruction ? [] : "/",
      disallow: underConstruction
        ? ["/"]
        : ["/dashboard", "/dashboard/", "/login/callback", "/confirm-account"],
    },
    sitemap: underConstruction ? undefined : `${baseUrl}/sitemap.xml`,
  };
}
