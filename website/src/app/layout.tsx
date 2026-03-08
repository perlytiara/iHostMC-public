import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";
import { SetHtmlLang } from "@/components/SetHtmlLang";
import { ThemeProvider } from "@/components/ThemeProvider";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const UNDER_CONSTRUCTION = process.env.NEXT_PUBLIC_SITE_UNDER_CONSTRUCTION !== "false";

export async function generateMetadata(): Promise<Metadata> {
  const underConstruction = UNDER_CONSTRUCTION;
  const title = `${BRAND.appName} – ${BRAND.tagline}`;
  const description = underConstruction
    ? "iHost is coming soon: a desktop app to host and manage game servers, starting with Minecraft. Sign up to get notified at launch."
    : "Host and manage game servers. Open source, free to start—register now. Minecraft, backups, and more. Support us on GitHub and join early members.";
  return {
    title,
    description,
    icons: { icon: "/icon.svg" },
    robots: underConstruction ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

const GTM_ID = "GTM-K47J2KTZ";
/** Google tag (gtag.js) measurement ID – manual install + Consent Mode v2. */
const GA4_MEASUREMENT_ID = "G-61H793HNCG";

/* Default: dark (Discord-style). Light only when explicitly set or system prefers light. */
const themeScript = `
(function(){
  var t = localStorage.getItem('ihostmc-theme');
  if (t === 'light') { document.documentElement.classList.remove('dark'); document.documentElement.setAttribute('data-theme','light'); }
  else if (t === 'dark' || !t) { document.documentElement.classList.add('dark'); document.documentElement.setAttribute('data-theme','dark'); }
  else { var d = window.matchMedia('(prefers-color-scheme: dark)').matches; document.documentElement.classList.toggle('dark', d); document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light'); }
})();
`;

/* Google Consent Mode v2: default deny for EEA/compliance; wait_for_update lets banner run first.
 * Advanced consent mode: url_passthrough and ads_data_redaction for better measurement when consent denied. */
const consentDefaultScript = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('consent', 'default', {
  'analytics_storage': 'denied',
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'wait_for_update': 500
});
gtag('set', 'url_passthrough', true);
gtag('set', 'ads_data_redaction', true);
`;

/* Google Tag Manager - load after consent defaults. */
const gtmHeadScript = `
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');
`;

/* Google tag (gtag.js) for GA4 – load after consent defaults so consent mode applies. */
const ga4ConfigScript = `
gtag('js', new Date());
gtag('config', '${GA4_MEASUREMENT_ID}');
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: consentDefaultScript }} />
        <script dangerouslySetInnerHTML={{ __html: gtmHeadScript }} />
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`} />
        <script dangerouslySetInnerHTML={{ __html: ga4ConfigScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased" suppressHydrationWarning>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
            title="Google Tag Manager"
          />
        </noscript>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <SetHtmlLang locale={locale} />
            {/* Wrapper suppresses hydration warnings from browser extensions (e.g. Dark Reader) that mutate SVG/style attributes after server render */}
            <div suppressHydrationWarning className="contents">
              {children}
            </div>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
