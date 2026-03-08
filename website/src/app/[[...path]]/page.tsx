import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getPathnameKey, pathToSegments, getPath, type PathnameKey, type Locale } from "@/i18n/pathnames";
import { routing } from "@/i18n/routing";
import HomePage from "@/app/_pages/HomePage";
import AboutPage from "@/app/_pages/AboutPage";
import ProductsPage from "@/app/_pages/ProductsPage";
import DocsPage from "@/app/_pages/DocsPage";
import ContributePage from "@/app/_pages/ContributePage";
import PricingPage from "@/app/_pages/PricingPage";
import CreditsPage from "@/app/_pages/CreditsPage";
import LoginPage from "@/app/_pages/LoginPage";
import LoginCallbackPage from "@/app/_pages/LoginCallbackPage";
import SignupPage from "@/app/_pages/SignupPage";
import ForgotPasswordPage from "@/app/_pages/ForgotPasswordPage";
import ResetPasswordPage from "@/app/_pages/ResetPasswordPage";
import VerifyEmailPage from "@/app/_pages/VerifyEmailPage";
import VerifyEmailWaitPage from "@/app/_pages/VerifyEmailWaitPage";
import ConfirmAccountPage from "@/app/_pages/ConfirmAccountPage";
import DashboardPage from "@/app/_pages/DashboardPage";
import DashboardLayout from "@/app/_pages/DashboardLayout";
import BackupsPage from "@/app/_pages/BackupsPage";
import BackupDetailPage from "@/app/_pages/BackupDetailPage";
import CloudServerPage from "@/app/_pages/CloudServerPage";
import DashboardAccountPage from "@/app/_pages/DashboardAccountPage";
import DashboardSettingsPage from "@/app/_pages/DashboardSettingsPage";
import DashboardVersionsPage from "@/app/_pages/DashboardVersionsPage";
import DashboardAdminPage from "@/app/_pages/DashboardAdminPage";
import CheckoutReturnPage from "@/app/_pages/CheckoutReturnPage";
import PrivacyPage from "@/app/_pages/PrivacyPage";
import CookiePolicyPage from "@/app/_pages/CookiePolicyPage";
import TermsPage from "@/app/_pages/TermsPage";
import ComingSoonPage from "@/app/_pages/ComingSoonPage";

const COOKIE_NAME = "NEXT_LOCALE";
const ADMIN_PREVIEW_COOKIE = "ihostmc-admin-preview";

/** When under construction, these pages are accessible (no admin cookie). Dashboard and app pages are not. */
const PUBLIC_PAGE_KEYS: PathnameKey[] = [
  "home",
  "about",
  "products",
  "docs",
  "contribute",
  "pricing",
  "credits",
  "login",
  "loginCallback",
  "signup",
  "forgotPassword",
  "resetPassword",
  "verifyEmail",
  "verifyEmailWait",
  "confirmAccount",
  "privacy",
  "cookiePolicy",
  "terms",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PAGE_MAP mixes no-arg and prop-driven pages
const PAGE_MAP: Record<PathnameKey, React.ComponentType<any>> = {
  home: HomePage,
  about: AboutPage,
  products: ProductsPage,
  docs: DocsPage,
  contribute: ContributePage,
  pricing: PricingPage,
  credits: CreditsPage,
  login: LoginPage,
  loginCallback: LoginCallbackPage,
  signup: SignupPage,
  forgotPassword: ForgotPasswordPage,
  resetPassword: ResetPasswordPage,
  verifyEmail: VerifyEmailPage,
  verifyEmailWait: VerifyEmailWaitPage,
  confirmAccount: ConfirmAccountPage,
  dashboard: DashboardPage,
  dashboardAccount: DashboardAccountPage,
  dashboardSettings: DashboardSettingsPage,
  dashboardBackups: BackupsPage,
  dashboardServers: BackupsPage,
  dashboardBackupDetail: BackupDetailPage,
  dashboardCloudServer: CloudServerPage,
  dashboardVersions: DashboardVersionsPage,
  dashboardAdmin: DashboardAdminPage,
  checkoutReturn: CheckoutReturnPage,
  privacy: PrivacyPage,
  cookiePolicy: CookiePolicyPage,
  terms: TermsPage,
};

const DASHBOARD_KEYS: PathnameKey[] = ["dashboard", "dashboardAccount", "dashboardSettings", "dashboardBackups", "dashboardServers", "dashboardBackupDetail", "dashboardCloudServer", "dashboardVersions", "dashboardAdmin"];

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ path?: string[] }> };

export default async function PathPage({ params }: Props) {
  const { path } = await params;
  const pathSegments = path ?? [];
  const cookieStore = await cookies();
  let locale = (cookieStore.get(COOKIE_NAME)?.value ?? routing.defaultLocale) as Locale;

  // If path starts with a locale segment (e.g. /en or /en/pricing from next-intl rewrite), use it
  const first = pathSegments[0];
  const segmentsForKey =
    first && routing.locales.includes(first as Locale)
      ? pathSegments.slice(1)
      : pathSegments;
  if (first && routing.locales.includes(first as Locale)) {
    locale = first as Locale;
  }

  if (!routing.locales.includes(locale)) {
    notFound();
  }

  const pathnameKey = segmentsForKey.length === 0 ? "home" : getPathnameKey(segmentsForKey, locale);

  // Under-construction: server reads at runtime (SITE_UNDER_CONSTRUCTION) or build-time (NEXT_PUBLIC_*). Default true. Admin cookie = full site.
  const underConstruction =
    (process.env.SITE_UNDER_CONSTRUCTION ??
      process.env.NEXT_PUBLIC_SITE_UNDER_CONSTRUCTION ??
      "true") !== "false";
  const previewVal = cookieStore.get(ADMIN_PREVIEW_COOKIE)?.value ?? "";
  const fullSiteAccess = previewVal === "1" || previewVal === "admin";
  const showComingSoonOnHome = underConstruction && !fullSiteAccess;

  const isDashboardRoute = pathnameKey && DASHBOARD_KEYS.includes(pathnameKey);
  if (!fullSiteAccess && isDashboardRoute) {
    redirect(getPath("home", locale) || "/");
  }
  if (!fullSiteAccess && pathnameKey && !PUBLIC_PAGE_KEYS.includes(pathnameKey)) {
    return <ComingSoonPage />;
  }

  // Under construction: products/docs/contribute/credits redirect to home (coming soon)
  const underConstructionOnlyKeys: PathnameKey[] = ["products", "docs", "contribute", "credits"];
  if (showComingSoonOnHome && pathnameKey && underConstructionOnlyKeys.includes(pathnameKey)) {
    redirect(getPath("home", locale) || "/");
  }

  if (!pathnameKey || !PAGE_MAP[pathnameKey]) {
    notFound();
  }

  const PageComponent = PAGE_MAP[pathnameKey];
  const content =
    pathnameKey === "dashboardServers" || pathnameKey === "dashboardBackups" ? (
      <BackupsPage pathSegments={segmentsForKey} pathnameKey={pathnameKey} />
    ) : pathnameKey === "dashboardBackupDetail" && segmentsForKey.length >= 4 ? (
      <BackupDetailPage backupId={segmentsForKey[3]!} />
    ) : pathnameKey === "dashboardCloudServer" && segmentsForKey.length >= 4 ? (
      <CloudServerPage serverId={segmentsForKey[3]!} pathSegments={segmentsForKey} />
    ) : pathnameKey === "home" ? (
      showComingSoonOnHome ? <ComingSoonPage /> : <HomePage />
    ) : pathnameKey === "pricing" ? (
      <PricingPage />
    ) : (
      <PageComponent />
    );

  if (DASHBOARD_KEYS.includes(pathnameKey)) {
    return <DashboardLayout>{content}</DashboardLayout>;
  }

  return (
    <div suppressHydrationWarning className="contents">
      {content}
    </div>
  );
}
