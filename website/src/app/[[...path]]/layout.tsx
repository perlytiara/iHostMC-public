import dynamic from "next/dynamic";

const AppContextMenu = dynamic(
  () => import("@/components/AppContextMenu").then((m) => ({ default: m.AppContextMenu })),
  { ssr: true }
);

const ConditionalSiteShell = dynamic(
  () => import("@/components/ConditionalSiteShell").then((m) => ({ default: m.ConditionalSiteShell })),
  { ssr: true }
);

const CookieConsent = dynamic(
  () => import("@/components/CookieConsent").then((m) => ({ default: m.CookieConsent })),
  { ssr: true }
);

export default function PathLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppContextMenu>
      <ConditionalSiteShell>{children}</ConditionalSiteShell>
      <CookieConsent />
    </AppContextMenu>
  );
}
