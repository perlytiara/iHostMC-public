import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Users, Package } from "lucide-react";

export default async function AboutPage() {
  const t = await getTranslations("about");

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16">
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="space-y-8">
        <section>
          <div className="flex items-center gap-3 mb-3">
            <div className="inline-flex justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
              <Package className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold">{t("productHeading")}</h2>
          </div>
          <p className="text-muted-foreground">{t("productDesc")}</p>
        </section>

        <section>
          <div className="flex items-center gap-3 mb-3">
            <div className="inline-flex justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold">{t("teamHeading")}</h2>
          </div>
          <p className="text-muted-foreground">{t("teamDesc")}</p>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/pricing"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("viewPricing")}
        </Link>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          {t("backToHome")}
        </Link>
      </div>
    </div>
  );
}
