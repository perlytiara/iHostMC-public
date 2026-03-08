import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SafeIcon } from "@/components/SafeIcon";
import { BRAND } from "@/lib/brand";
import { Server, Share2, Cloud, ArrowRight, Gamepad2, Github, Users, Cpu } from "lucide-react";

export default async function HomePage() {
  const t = await getTranslations("home");

  return (
    <div className="flex flex-col w-full">
      {/* Hero — full viewport on every device (100dvh = dynamic viewport height) */}
      <section className="relative w-full min-h-[100dvh] min-h-[100svh] min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 py-16 sm:py-20 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none hero-gradient-bg"
          aria-hidden
        />
        <div className="relative w-full max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6 text-balance">
            {t("title")}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto text-balance">
            {t("subtitle")}
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Button asChild size="lg" className="rounded-xl px-8 text-base font-semibold shadow-lg">
              <Link href="/signup">{t("getStarted")}</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-xl px-8 text-base font-medium">
              <Link href="/login">{t("signIn")}</Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="rounded-xl text-muted-foreground">
              <Link href="/products">
                {t("viewProducts")}
                <SafeIcon><ArrowRight className="ml-2 h-4 w-4 inline" /></SafeIcon>
              </Link>
            </Button>
          </div>
          <p className="mt-6 sm:mt-8 text-sm text-muted-foreground">{t("downloadFromDashboard")}</p>
        </div>
      </section>

      {/* Support us — prominent, marketing */}
      <section className="w-full border-y border-border/60 bg-primary/5 py-16 md:py-20">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-semibold mb-3">{t("backProjectHeading")}</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">{t("backProjectDesc")}</p>
          <Button asChild size="lg" variant="outline" className="rounded-xl gap-2">
            <a href={BRAND.githubRepo} target="_blank" rel="noopener noreferrer" aria-label="Star iHostMC on GitHub">
              <SafeIcon><Github className="h-5 w-5" /></SafeIcon>
              {t("starOnGitHub")}
            </a>
          </Button>
        </div>
      </section>

      {/* Products preview — full-width container */}
      <section className="w-full py-16 md:py-20">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-semibold mb-2 text-center">{t("productsHeading")}</h2>
          <p className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">{t("productsSubheading")}</p>
          <div className="grid gap-6 sm:grid-cols-2 mb-10">
            <Card className="border-2 border-primary/20 hover:border-primary/40 transition-colors rounded-xl overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 mb-1">
                  <SafeIcon><Server className="h-5 w-5 text-primary" /></SafeIcon>
                  <CardTitle className="text-lg">{t("productMinecraft")}</CardTitle>
                </div>
                <CardDescription>{t("productMinecraftDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button asChild variant="outline" size="sm" className="rounded-lg">
                  <Link href="/products">{t("learnMore")}</Link>
                </Button>
              </CardContent>
            </Card>
            <Card className="opacity-85 rounded-xl">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 mb-1">
                  <SafeIcon><Gamepad2 className="h-5 w-5 text-muted-foreground" /></SafeIcon>
                  <CardTitle className="text-lg">{t("productMoreComing")}</CardTitle>
                </div>
                <CardDescription>{t("productMoreComingDesc")}</CardDescription>
              </CardHeader>
            </Card>
          </div>
          <div className="flex justify-center">
            <Button asChild variant="secondary" className="rounded-xl" size="lg">
              <Link href="/products">{t("viewAllProducts")}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Early members — illustrated block */}
      <section className="w-full border-t border-border/50 py-16 md:py-20 bg-card/30">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl md:text-3xl font-semibold mb-3">{t("earlyMembersHeading")}</h2>
              <p className="text-muted-foreground mb-6">{t("earlyMembersDesc")}</p>
              <Button asChild size="lg" className="rounded-xl">
                <Link href="/signup">{t("openAppCta")}</Link>
              </Button>
            </div>
            <div className="flex-shrink-0 rounded-2xl border-2 border-primary/20 bg-primary/5 p-10">
              <SafeIcon><Users className="h-20 w-20 text-primary/80 mx-auto" /></SafeIcon>
            </div>
          </div>
        </div>
      </section>

      {/* Features — Why iHost */}
      <section className="w-full py-16 md:py-20 bg-muted/20">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-semibold mb-10 text-center">{t("featuresHeading")}</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <SafeIcon><Server className="h-4 w-4 text-primary" /></SafeIcon>
                  {t("featureOne")}
                </CardTitle>
                <CardDescription>{t("featureOneDesc")}</CardDescription>
              </CardHeader>
            </Card>
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <SafeIcon><Share2 className="h-4 w-4 text-primary" /></SafeIcon>
                  {t("featureTwo")}
                </CardTitle>
                <CardDescription>{t("featureTwoDesc")}</CardDescription>
              </CardHeader>
            </Card>
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <SafeIcon><Cloud className="h-4 w-4 text-primary" /></SafeIcon>
                  {t("featureThree")}
                </CardTitle>
                <CardDescription>{t("featureThreeDesc")}</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* DIY & self-host */}
      <section className="w-full border-t border-border/50 py-16 md:py-20">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row-reverse items-center gap-10 md:gap-16">
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl md:text-3xl font-semibold mb-3">{t("diyHeading")}</h2>
              <p className="text-muted-foreground mb-4">{t("diyDesc")}</p>
              <p className="text-sm text-muted-foreground/80">{t("diyComingSoon")}</p>
            </div>
            <div className="flex-shrink-0 rounded-2xl border-2 border-primary/20 bg-primary/5 p-10">
              <SafeIcon><Cpu className="h-20 w-20 text-primary/80 mx-auto" /></SafeIcon>
            </div>
          </div>
        </div>
      </section>

      {/* Tiers + CTA */}
      <section className="w-full py-16 md:py-20 bg-card/20">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-xl md:text-2xl font-semibold mb-6">{t("tiersPreview")}</h2>
          <div className="grid gap-6 sm:grid-cols-2 mb-10">
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle>{t("freeTier")}</CardTitle>
                <CardDescription>{t("freeTierDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm" className="rounded-lg w-full">
                  <Link href="/signup">{t("getStarted")}</Link>
                </Button>
              </CardContent>
            </Card>
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle>{t("upgradeTiers")}</CardTitle>
                <CardDescription>{t("upgradeTiersDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="secondary" size="sm" className="rounded-lg w-full">
                  <Link href="/pricing">{t("viewPricing")}</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-wrap gap-4 justify-center">
            <Button asChild size="lg" className="rounded-xl">
              <Link href="/docs">{t("readDocs")}</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-xl">
              <Link href="/contribute">{t("contribute")}</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
