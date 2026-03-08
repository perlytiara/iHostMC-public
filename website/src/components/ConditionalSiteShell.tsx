"use client";

import { usePathname } from "@/i18n/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

/** Renders the marketing site chrome (Header + main + Footer) only when not on a dashboard route. */
export function ConditionalSiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard =
    pathname?.includes("dashboard") ||
    pathname?.includes("uebersicht") ||
    pathname?.includes("tableau-de-bord");

  if (isDashboard) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
