import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND } from "@/lib/brand";
import { Code2, GitFork, Heart, MessageCircle } from "lucide-react";

export default async function ContributePage() {
  const t = await getTranslations("contribute");

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 md:py-16">
      <section className="text-center mb-14">
        <div className="inline-flex items-center justify-center rounded-full bg-primary/10 p-3 mb-4">
          <Heart className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-3">{t("title")}</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{t("subtitle")}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 mb-10">
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <GitFork className="h-5 w-5" />
              {t("codeTitle")}
            </CardTitle>
            <CardDescription>{t("codeDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">{t("codeHint")}</p>
            <Button asChild variant="outline" size="sm">
              <a href={BRAND.githubRepo} target="_blank" rel="noopener noreferrer">
                {t("viewOnGitHub")}
              </a>
            </Button>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Code2 className="h-5 w-5" />
              {t("docsTitle")}
            </CardTitle>
            <CardDescription>{t("docsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/docs">{t("goToDocs")}</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageCircle className="h-5 w-5" />
              {t("feedbackTitle")}
            </CardTitle>
            <CardDescription>{t("feedbackDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("feedbackHint")}</p>
          </CardContent>
        </Card>
      </section>

      <Card className="mb-8 rounded-xl border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle>{t("thanksTitle")}</CardTitle>
          <CardDescription>{t("thanksDesc")}</CardDescription>
        </CardHeader>
      </Card>

      <div className="flex justify-center gap-4">
        <Button asChild variant="outline" size="lg">
          <Link href="/">{t("backToHome")}</Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/products">{t("viewProducts")}</Link>
        </Button>
      </div>
    </div>
  );
}
