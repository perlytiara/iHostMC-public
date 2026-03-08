import { getTranslations, getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";

const CREDIT_PACKS = [
  { id: "small", credits: 250, priceUsd: 3.99 },
  { id: "medium", credits: 1000, priceUsd: 10 },
  { id: "bulk", credits: 5000, priceUsd: 50 },
];

function formatPrice(price: number, locale: string): string {
  const lang = (locale || "en").split("-")[0];
  if (lang === "de" || lang === "fr") return `${price.toFixed(2)}€`;
  return `$${price.toFixed(2)}`;
}

export default async function CreditsPage() {
  const locale = await getLocale();
  const t = await getTranslations("credits");

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 md:py-16">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-4">
          <Zap className="h-7 w-7" />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-2">{t("title")}</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">{t("subtitle")}</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-3 max-w-4xl mx-auto">
        {CREDIT_PACKS.map((pack) => (
          <Card key={pack.id} className="flex flex-col rounded-xl">
            <CardHeader>
              <CardTitle>{t(`pack${pack.id.charAt(0).toUpperCase() + pack.id.slice(1)}`)}</CardTitle>
              <p className="text-2xl font-bold text-primary">{pack.credits} {t("credits")}</p>
              <p className="text-sm text-muted-foreground">{formatPrice(pack.priceUsd, locale)}</p>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground">{t("oneTimePurchase")}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-10 max-w-4xl mx-auto rounded-xl">
        <CardHeader>
          <CardTitle>{t("howToBuy")}</CardTitle>
          <CardDescription>{t("howToBuyDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard/account">{t("openApp")}</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="mt-8 flex justify-center gap-4">
        <Button asChild variant="outline">
          <Link href="/pricing">{t("viewPlans")}</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
