import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Cookie } from "lucide-react";

export default async function CookiePolicyPage() {
  const t = await getTranslations("cookiePolicy");

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16">
      <div className="mb-10">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
          <Cookie className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lastUpdated")}</p>
      </div>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-sm">
        <section>
          <h2 className="text-lg font-semibold mb-2">{t("whatHeading")}</h2>
          <p className="text-muted-foreground">{t("whatBody")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("weUseHeading")}</h2>
          <p className="text-muted-foreground">{t("weUseBody")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("analyticsHeading")}</h2>
          <p className="text-muted-foreground">{t("analyticsBody")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("essentialHeading")}</h2>
          <p className="text-muted-foreground">{t("essentialBody")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("controlHeading")}</h2>
          <p className="text-muted-foreground">{t("controlBody")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("eeaHeading")}</h2>
          <p className="text-muted-foreground">{t("eeaBody")}</p>
        </section>
      </div>

      <p className="mt-10 text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/privacy" className="underline hover:text-foreground">
          {t("privacyLink")}
        </Link>
        <Link href="/terms" className="underline hover:text-foreground">
          {t("termsLink")}
        </Link>
        <Link href="/" className="underline hover:text-foreground">
          {t("backToHome")}
        </Link>
      </p>
    </div>
  );
}
