const path = require("path");
const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// In production, set NEXT_PUBLIC_APP_URL so CSS/JS load correctly when behind a proxy.
// In local dev, leave it unset so assets load from same origin (no missing styles/scripts).
const appUrl =
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_APP_URL != null &&
  process.env.NEXT_PUBLIC_APP_URL !== ""
    ? String(process.env.NEXT_PUBLIC_APP_URL).replace(/\/$/, "")
    : undefined;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(appUrl && { assetPrefix: appUrl }),
  // Avoid "multiple lockfiles" warning when building from monorepo (deploy from repo root)
  outputFileTracingRoot: path.resolve(__dirname),
};
module.exports = withNextIntl(nextConfig);
