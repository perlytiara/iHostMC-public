import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Shield } from "lucide-react";

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16">
      <div className="mb-10">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
          <Shield className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lastUpdated")}</p>
      </div>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-sm">
        <section>
          <h2 className="text-lg font-semibold mb-2">{t("researchHeading")}</h2>
          <p className="text-muted-foreground">{t("researchBody")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("statsHeading")}</h2>
          <p className="text-muted-foreground">{t("statsBody")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("noThirdPartyHeading")}</h2>
          <p className="text-muted-foreground">{t("noThirdPartyBody")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("cookiesHeading")}</h2>
          <p className="text-muted-foreground">{t("cookiesBody")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("gdprHeading")}</h2>
          <p className="text-muted-foreground">{t("gdprBody")}</p>
        </section>
      </div>

      <p className="mt-10 text-sm text-muted-foreground">
        <Link href="/" className="underline hover:text-foreground">
          {t("backToHome")}
        </Link>
      </p>
    </div>
  );
}
