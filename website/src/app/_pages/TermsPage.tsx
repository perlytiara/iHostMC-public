import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { FileText } from "lucide-react";

export default async function TermsPage() {
  const t = await getTranslations("terms");

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16">
      <div className="mb-10">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
          <FileText className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lastUpdated")}</p>
      </div>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-sm">
        <section>
          <h2 className="text-lg font-semibold mb-2">{t("acceptanceHeading")}</h2>
          <p className="text-muted-foreground">{t("acceptanceBody")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("serviceHeading")}</h2>
          <p className="text-muted-foreground">{t("serviceBody")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("accountHeading")}</h2>
          <p className="text-muted-foreground">{t("accountBody")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("conductHeading")}</h2>
          <p className="text-muted-foreground">{t("conductBody")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("liabilityHeading")}</h2>
          <p className="text-muted-foreground">{t("liabilityBody")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("changesHeading")}</h2>
          <p className="text-muted-foreground">{t("changesBody")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("contactHeading")}</h2>
          <p className="text-muted-foreground">{t("contactBody")}</p>
        </section>
      </div>

      <p className="mt-10 text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/privacy" className="underline hover:text-foreground">
          {t("privacyLink")}
        </Link>
        <Link href="/cookies" className="underline hover:text-foreground">
          {t("cookieLink")}
        </Link>
        <Link href="/" className="underline hover:text-foreground">
          {t("backToHome")}
        </Link>
      </p>
    </div>
  );
}
