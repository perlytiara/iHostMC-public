import { getServerTranslations } from "@/lib/i18n-server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Download, Server, Settings, FileArchive } from "lucide-react";

export default async function DocsPage() {
  const t = await getServerTranslations("docs");

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 md:py-16">
      <section className="text-center mb-14">
        <div className="inline-flex items-center justify-center rounded-full bg-primary/10 p-3 mb-4">
          <BookOpen className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-3">{t("title")}</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{t("subtitle")}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 mb-10">
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Download className="h-5 w-5" />
              {t("gettingStarted")}
            </CardTitle>
            <CardDescription>{t("gettingStartedDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/signup">{t("createAccount")}</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="h-5 w-5" />
              {t("hostingServers")}
            </CardTitle>
            <CardDescription>{t("hostingServersDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/products">{t("viewProducts")}</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings className="h-5 w-5" />
              {t("backupAndTiers")}
            </CardTitle>
            <CardDescription>{t("backupAndTiersDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/pricing">{t("viewPricing")}</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card id="export-format" className="mb-8 rounded-xl scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileArchive className="h-5 w-5" />
            Export &amp; import format
          </CardTitle>
          <CardDescription>
            Backups and sync data can be exported as a <strong>ZIP</strong> (full copy with{" "}
            <code className="rounded bg-muted px-1">ihostmc-import.json</code> at root) or as a single{" "}
            <strong>.ihostmc-snapshot</strong> JSON file. Import a ZIP to create a new sync server with all files, or import a snapshot file to add a metadata-only backup. The format is documented in the repo as <code className="rounded bg-muted px-1">docs/IHOSTMC-SNAPSHOT-FORMAT.md</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/backups">Import &amp; export in dashboard</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-8 rounded-xl border-dashed">
        <CardHeader>
          <CardTitle>{t("fullDocsTitle")}</CardTitle>
          <CardDescription>{t("fullDocsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary">
            <Link href="/contribute">{t("contributeLink")}</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button asChild variant="outline" size="lg">
          <Link href="/">{t("backToHome")}</Link>
        </Button>
      </div>
    </div>
  );
}
