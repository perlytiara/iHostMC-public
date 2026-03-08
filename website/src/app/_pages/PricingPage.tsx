import { getTranslations } from "next-intl/server";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const tierIds = ["free", "backup", "pro"] as const;
const tierPrices: Record<(typeof tierIds)[number], number> = {
  free: 0,
  backup: 3.99,
  pro: 11.99,
};

function formatPrice(price: number, locale: string): string {
  if (price === 0) return "Free";
  const lang = (locale || "en").split("-")[0];
  if (lang === "de" || lang === "fr") return `${price.toFixed(2)}€`;
  return `$${price.toFixed(2)}`;
}

export default async function PricingPage() {
  const locale = await getLocale();
  const t = await getTranslations("pricing");

  const tiers = tierIds.map((id) => ({
    id,
    name: t(id),
    price: tierPrices[id],
    descKey: id === "free" ? "freeDesc" : id === "backup" ? "backupDesc" : "proDesc",
  }));

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 md:py-16">
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-3 max-w-4xl mx-auto">
        {tiers.map((tier) => (
          <Card
            key={tier.id}
            className={`rounded-xl ${tier.id === "pro" ? "border-primary bg-primary/5" : tier.id === "backup" ? "border-muted-foreground/30" : ""}`}
          >
            <CardHeader>
              <CardTitle>{tier.name}</CardTitle>
              <p className="text-2xl font-bold">
                {tier.price === 0 ? t("free") : formatPrice(tier.price, locale)}
                {tier.price > 0 && <span className="text-sm font-normal text-muted-foreground">{t("perMonth")}</span>}
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t(tier.descKey)}</p>
              {tier.id === "free" && <p className="text-xs text-muted-foreground mt-2">{t("noCreditCard")}</p>}
              {tier.id !== "free" && <p className="text-xs text-muted-foreground mt-2">{t("subscribeInApp")}</p>}
            </CardContent>
            <CardFooter>
              <Button asChild variant={tier.id === "free" ? "default" : "outline"} size="sm" className="w-full">
                <Link href={tier.id === "free" ? "/signup" : "/dashboard"}>{t("getStarted")}</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      <Card className="mt-10 max-w-4xl mx-auto rounded-xl">
        <CardHeader>
          <CardTitle>{t("backupNote")}</CardTitle>
          <CardDescription>{t("backupNoteBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("subscribeNote")}</p>
        </CardContent>
      </Card>
      <div className="mt-8 flex justify-center gap-4">
        <Button asChild>
          <Link href="/signup">{t("getStarted")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
