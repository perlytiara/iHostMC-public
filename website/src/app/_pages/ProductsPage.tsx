import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Gamepad2, Server, Sparkles } from "lucide-react";
import { PRODUCT_SLUGS, DEFAULT_PRODUCT_SLUG } from "@/lib/products";

export default async function ProductsPage() {
  const t = await getTranslations("products");
  const minecraft = PRODUCT_SLUGS.find((p) => p.slug === DEFAULT_PRODUCT_SLUG);
  const comingSoon = PRODUCT_SLUGS.filter((p) => p.slug !== DEFAULT_PRODUCT_SLUG);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 md:py-16">
      <section className="text-center mb-10 md:mb-14">
        <h1 className="text-3xl md:text-4xl font-bold mb-3">{t("title")}</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{t("subtitle")}</p>
      </section>

      {/* Minecraft — live product */}
      {minecraft && (
        <section className="mb-10">
          <Card className="overflow-hidden rounded-xl border-2 border-primary/20 hover:border-primary/40 transition-colors">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3 mb-2">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Server className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{t("minecraftTitle")}</CardTitle>
                <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary">
                  Live
                </span>
              </div>
              <CardDescription>{t("minecraftDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="text-sm text-muted-foreground space-y-1 mb-4">
                <li>• {t("minecraftFeature1")}</li>
                <li>• {t("minecraftFeature2")}</li>
                <li>• {t("minecraftFeature3")}</li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button asChild>
                  <Link href="/signup">{t("getStarted")}</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/dashboard">{t("openApp")}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Coming soon — visible game cards */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          {t("moreComingTitle")}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">{t("moreComingDesc")}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {comingSoon.map((game) => (
            <Card
              key={game.slug}
              className="overflow-hidden rounded-xl border border-border bg-card/60 opacity-95 hover:opacity-100 transition-opacity"
            >
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-muted p-2">
                    <Gamepad2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-base">{game.name}</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  {t("comingSoonLabel")}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
        <p className="text-sm text-muted-foreground mt-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          {t("moreComingHint")}
        </p>
      </section>

      <div className="flex flex-wrap justify-center gap-4">
        <Button asChild variant="outline" size="lg">
          <Link href="/">{t("backToHome")}</Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/pricing">{t("viewPricing")}</Link>
        </Button>
      </div>
    </div>
  );
}
