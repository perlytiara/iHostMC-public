"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SafeIcon } from "@/components/SafeIcon";
import { BRAND } from "@/lib/brand";
import { RECAPTCHA_SITE_KEY } from "@/lib/recaptcha";
import {
  Mail,
  LogIn,
  Server,
  FolderArchive,
  Sparkles,
  Settings,
  Home,
  Gamepad2,
  Wrench,
  ShieldCheck,
  Share2,
  Cloud,
  Github,
  Users,
  Cpu,
} from "lucide-react";

const FORMSPARK_ACTION = "https://submit-form.com/nmZLRAlzf";
const NOTIFY_FORM_ID = "notify-form";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      getResponse: () => string;
      reset: () => void;
    };
  }
}

function scrollToNotifyForm() {
  document.getElementById(NOTIFY_FORM_ID)?.scrollIntoView({ behavior: "smooth" });
}

/** Screenshot-style remake of the desktop app – UI replica (no actual screenshot). */
function AppPreviewMockup() {
  return (
    <div className="relative w-full max-w-3xl mx-auto rounded-xl overflow-hidden border border-border/80 shadow-2xl shadow-primary/10 bg-[hsl(224,28%,6%)] [box-shadow:0_0_0_1px_hsl(var(--border)),0_25px_50px_-12px_rgba(0,0,0,0.5),0_0_80px_-20px_hsl(var(--primary)/0.2)]">
      <div className="flex h-10 items-center gap-2 px-3 border-b shrink-0 border-[hsl(224,18%,18%)] bg-[hsl(224,28%,6%)]">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57]" aria-hidden />
          <span className="w-3 h-3 rounded-full bg-[#febc2e]" aria-hidden />
          <span className="w-3 h-3 rounded-full bg-[#28c840]" aria-hidden />
        </div>
        <span className="text-[11px] text-muted-foreground ml-2 font-medium">iHost</span>
      </div>
      <div className="flex h-12 items-center gap-2 pl-3 pr-4 border-b shrink-0 border-[hsl(224,18%,18%)] bg-[hsl(224,28%,6%)]">
        <div className="flex items-center gap-2 shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={28} height={28} className="shrink-0 rounded">
            <defs>
              <linearGradient id="mock-logo-bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7c6bff" />
                <stop offset="100%" stopColor="#5344dd" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="6" fill="url(#mock-logo-bg)" />
            <g transform="translate(16, 15.35) scale(1.28) translate(-13.25, -14.75)" fill="white">
              <circle cx="11" cy="10" r="2.25" />
              <path d="M11 14v8 M14 14v5 M14 17h4 M18 14v8" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </g>
          </svg>
          <span className="text-sm font-bold text-[hsl(210,20%,98%)]">iHost</span>
        </div>
        <nav className="flex items-center gap-0.5 ml-2">
          {[
            { icon: Home, label: "Home", active: true },
            { icon: Server, label: "Servers", active: false },
            { icon: FolderArchive, label: "Storage", active: false },
            { icon: Sparkles, label: "Advisor", active: false },
            { icon: Settings, label: "Settings", active: false },
          ].map(({ icon: Icon, label, active }) => (
            <span
              key={label}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${active ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </span>
          ))}
        </nav>
      </div>
      <div className="flex flex-col min-h-[280px] p-4 gap-4 bg-[hsl(224,28%,8%)]">
        <div>
          <h2 className="text-sm font-bold text-[hsl(210,20%,98%)]">Welcome back</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Create and manage game servers. Start with Minecraft.</p>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Total storage</span>
            <span>2.1 GB / 5 GB</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden bg-[hsl(224,18%,16%)]">
            <div className="h-full rounded-full bg-primary/80 w-[42%]" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {["Survival 1.20", "Creative"].map((name) => (
            <div
              key={name}
              className="flex items-center gap-3 rounded-lg border p-3 border-[hsl(224,18%,20%)] bg-[hsl(224,22%,11%)]"
            >
              <div className="rounded-lg p-2 bg-primary/10">
                <Gamepad2 className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[hsl(210,20%,98%)] truncate">{name}</p>
                <p className="text-[10px] text-muted-foreground">Paper 1.20 · Stopped</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ComingSoonPage() {
  const t = useTranslations("comingSoonPage");
  const tHome = useTranslations("home");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const skipRecaptcha = !RECAPTCHA_SITE_KEY;
  const [recaptchaReady, setRecaptchaReady] = useState(skipRecaptcha);
  const recaptchaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skipRecaptcha || typeof window === "undefined") {
      setRecaptchaReady(true);
      return;
    }
    if (window.grecaptcha) {
      setRecaptchaReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://www.google.com/recaptcha/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.grecaptcha?.ready(() => setRecaptchaReady(true));
    };
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [skipRecaptcha]);

  const getRecaptchaToken = (): string => {
    if (skipRecaptcha || typeof window === "undefined") return "";
    try {
      return window.grecaptcha?.getResponse() ?? "";
    } catch {
      return "";
    }
  };

  const resetRecaptcha = (): void => {
    if (skipRecaptcha || typeof window === "undefined") return;
    try {
      window.grecaptcha?.reset();
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    if (!trimmedEmail) return;

    const token = getRecaptchaToken();
    if (!skipRecaptcha && !token) {
      setStatus("error");
      setStatusMessage("Please complete the reCAPTCHA.");
      return;
    }

    setStatus("loading");
    setStatusMessage("");
    try {
      const formData = new FormData();
      formData.append("name", trimmedName || "—");
      formData.append("email", trimmedEmail);
      formData.append("message", message.trim() || "Sign up for iHost launch notification");
      formData.append("g-recaptcha-response", token);

      const res = await fetch(FORMSPARK_ACTION, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setStatus("success");
        setStatusMessage("You're on the list. We'll notify you when we're ready.");
        setName("");
        setEmail("");
        setMessage("");
        resetRecaptcha();
      } else {
        setStatus("error");
        setStatusMessage("Something went wrong. Please try again.");
        resetRecaptcha();
      }
    } catch {
      setStatus("error");
      setStatusMessage("Something went wrong. Please try again.");
      resetRecaptcha();
    }
  };

  return (
    <div className="flex flex-col w-full" suppressHydrationWarning>
      {/* Under construction — front and center (suppressHydrationWarning: extensions like Dark Reader mutate SVG/style after SSR) */}
      <div
        className="w-full border-b-2 border-primary/30 bg-primary/10 py-3 sm:py-4 px-4 sm:px-6"
        role="status"
        aria-live="polite"
      >
        <div className="max-w-5xl mx-auto flex items-center justify-center gap-2.5 text-sm sm:text-base font-medium text-primary">
          <Wrench className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" aria-hidden />
          <span>{t("underConstructionBar")}</span>
        </div>
      </div>

      {/* Hero: short headline + Formspark form head-first (no signup, only get notified) */}
      <section className="relative w-full px-4 sm:px-6 py-8 sm:py-12 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none hero-gradient-bg coming-soon-hero-bg" aria-hidden />
        <div className="relative w-full max-w-2xl mx-auto">
          <p className="text-xs font-medium uppercase tracking-wider text-primary/90 mb-3 text-center">{t("heroBadge")}</p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-2 text-center text-balance">
            {tHome("title")}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground text-center mb-8 text-balance">
            {tHome("subtitle")}
          </p>

      {/* Formspark form — get notified (same role as “early member” CTA on full site) */}
          <div id={NOTIFY_FORM_ID} className="rounded-2xl border-2 border-primary/20 bg-card/95 backdrop-blur-sm p-6 sm:p-8 shadow-xl shadow-primary/10 scroll-mt-24">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <Mail className="h-4 w-4 text-primary shrink-0" />
              {t("notifyHeading")}
            </div>
            <p className="text-sm text-muted-foreground mb-4">{t("notifySubtitle", { brand: BRAND.appName })}</p>
            {status === "success" ? (
              <p className="text-sm text-green-600 dark:text-green-400 py-2">{statusMessage}</p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="coming-soon-email" className="sr-only">Email</Label>
                  <Input
                    id="coming-soon-email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={status === "loading"}
                    required
                    className="rounded-lg"
                  />
                </div>
                <div>
                  <Label htmlFor="coming-soon-name" className="sr-only">Name</Label>
                  <Input
                    id="coming-soon-name"
                    name="name"
                    type="text"
                    placeholder={t("namePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={status === "loading"}
                    className="rounded-lg"
                  />
                </div>
                <div>
                  <Label htmlFor="coming-soon-message" className="sr-only">Message</Label>
                  <textarea
                    id="coming-soon-message"
                    name="message"
                    placeholder={t("messagePlaceholder")}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={status === "loading"}
                    rows={2}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={status === "loading" || !recaptchaReady}
                  className="rounded-lg w-full sm:w-auto"
                >
                  {status === "loading" ? "…" : t("signUpUpdates")}
                </Button>
                {!skipRecaptcha && recaptchaReady && (
                  <div ref={recaptchaRef} className="[&_.g-recaptcha]:inline-block">
                    <div className="g-recaptcha" data-sitekey={RECAPTCHA_SITE_KEY} data-theme="dark" aria-label="reCAPTCHA" />
                  </div>
                )}
                {!skipRecaptcha && !recaptchaReady && <p className="text-xs text-muted-foreground">Loading verification…</p>}
                {status === "error" && statusMessage && (
                  <p className="text-sm text-destructive">{statusMessage}</p>
                )}
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden />
                  {t("formTrust")}
                </p>
              </form>
            )}
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("noSignupYet")}{" "}
            <button type="button" onClick={() => { window.location.href = "/login"; }} className="text-primary font-medium hover:underline bg-transparent border-0 cursor-pointer p-0 font-inherit">{tHome("signIn")}</button>
            {" · "}
            <button type="button" onClick={() => { window.location.href = "/signup"; }} className="text-primary font-medium hover:underline bg-transparent border-0 cursor-pointer p-0 font-inherit">{t("createAccount")}</button>
          </p>
        </div>
      </section>

      {/* Support us — same as homepage */}
      <section className="w-full border-y border-border/60 bg-primary/5 py-16 md:py-20">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-semibold mb-3">{tHome("backProjectHeading")}</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">{tHome("backProjectDesc")}</p>
          <Button asChild size="lg" variant="outline" className="rounded-xl gap-2">
            <a href={BRAND.githubRepo} target="_blank" rel="noopener noreferrer" aria-label="Star iHostMC on GitHub">
              <SafeIcon><Github className="h-5 w-5" /></SafeIcon>
              {tHome("starOnGitHub")}
            </a>
          </Button>
        </div>
      </section>

      {/* What we build — same as homepage */}
      <section className="w-full py-16 md:py-20">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-semibold mb-2 text-center">{tHome("productsHeading")}</h2>
          <p className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">{tHome("productsSubheading")}</p>
          <div className="grid gap-6 sm:grid-cols-2 mb-10">
            <Card className="border-2 border-primary/20 hover:border-primary/40 transition-colors rounded-xl overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 mb-1">
                  <SafeIcon><Server className="h-5 w-5 text-primary" /></SafeIcon>
                  <CardTitle className="text-lg">{tHome("productMinecraft")}</CardTitle>
                </div>
                <CardDescription>{tHome("productMinecraftDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={scrollToNotifyForm}>
                  {tHome("learnMore")}
                </Button>
              </CardContent>
            </Card>
            <Card className="opacity-85 rounded-xl">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 mb-1">
                  <SafeIcon><Gamepad2 className="h-5 w-5 text-muted-foreground" /></SafeIcon>
                  <CardTitle className="text-lg">{tHome("productMoreComing")}</CardTitle>
                </div>
                <CardDescription>{tHome("productMoreComingDesc")}</CardDescription>
              </CardHeader>
            </Card>
          </div>
          <div className="flex justify-center">
            <Button type="button" variant="secondary" className="rounded-xl" size="lg" onClick={scrollToNotifyForm}>
              {tHome("viewAllProducts")}
            </Button>
          </div>
        </div>
      </section>

      {/* App preview — screenshot remake */}
      <section className="w-full border-t border-border/50 py-16 md:py-20 bg-card/30">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-semibold mb-2 text-center">{t("appPreviewCaption")}</h2>
          <p className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">{t("appPreviewSubtitle")}</p>
          <div className="rounded-xl overflow-hidden ring-1 ring-border/80 shadow-xl">
            <AppPreviewMockup />
          </div>
        </div>
      </section>

      {/* Be among the first — same as homepage, CTA scrolls to form */}
      <section className="w-full border-t border-border/50 py-16 md:py-20 bg-card/30">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl md:text-3xl font-semibold mb-3">{tHome("earlyMembersHeading")}</h2>
              <p className="text-muted-foreground mb-6">{tHome("earlyMembersDesc")}</p>
              <Button size="lg" className="rounded-xl" onClick={scrollToNotifyForm}>
                {tHome("openAppCta")}
              </Button>
            </div>
            <div className="flex-shrink-0 rounded-2xl border-2 border-primary/20 bg-primary/5 p-10">
              <SafeIcon><Users className="h-20 w-20 text-primary/80 mx-auto" /></SafeIcon>
            </div>
          </div>
        </div>
      </section>

      {/* Why iHost — same as homepage */}
      <section className="w-full py-16 md:py-20 bg-muted/20">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl md:text-3xl font-semibold mb-10 text-center">{tHome("featuresHeading")}</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <SafeIcon><Server className="h-4 w-4 text-primary" /></SafeIcon>
                  {tHome("featureOne")}
                </CardTitle>
                <CardDescription>{tHome("featureOneDesc")}</CardDescription>
              </CardHeader>
            </Card>
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <SafeIcon><Share2 className="h-4 w-4 text-primary" /></SafeIcon>
                  {tHome("featureTwo")}
                </CardTitle>
                <CardDescription>{tHome("featureTwoDesc")}</CardDescription>
              </CardHeader>
            </Card>
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <SafeIcon><Cloud className="h-4 w-4 text-primary" /></SafeIcon>
                  {tHome("featureThree")}
                </CardTitle>
                <CardDescription>{tHome("featureThreeDesc")}</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* DIY & self-host — same as homepage */}
      <section className="w-full border-t border-border/50 py-16 md:py-20">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row-reverse items-center gap-10 md:gap-16">
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl md:text-3xl font-semibold mb-3">{tHome("diyHeading")}</h2>
              <p className="text-muted-foreground mb-4">{tHome("diyDesc")}</p>
              <p className="text-sm text-muted-foreground/80">{tHome("diyComingSoon")}</p>
            </div>
            <div className="flex-shrink-0 rounded-2xl border-2 border-primary/20 bg-primary/5 p-10">
              <SafeIcon><Cpu className="h-20 w-20 text-primary/80 mx-auto" /></SafeIcon>
            </div>
          </div>
        </div>
      </section>

      {/* Plans + CTA — same as homepage; Get started scrolls to form */}
      <section className="w-full py-16 md:py-20 bg-card/20">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-xl md:text-2xl font-semibold mb-6">{tHome("tiersPreview")}</h2>
          <div className="grid gap-6 sm:grid-cols-2 mb-10">
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle>{tHome("freeTier")}</CardTitle>
                <CardDescription>{tHome("freeTierDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" className="rounded-lg w-full" onClick={scrollToNotifyForm}>
                  {tHome("getStarted")}
                </Button>
              </CardContent>
            </Card>
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle>{tHome("upgradeTiers")}</CardTitle>
                <CardDescription>{tHome("upgradeTiersDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="secondary" size="sm" className="rounded-lg w-full" onClick={scrollToNotifyForm}>
                  {tHome("viewPricing")}
                </Button>
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-wrap gap-4 justify-center">
            <Button size="lg" className="rounded-xl" onClick={scrollToNotifyForm}>
              {tHome("readDocs")}
            </Button>
            <Button variant="outline" size="lg" className="rounded-xl" onClick={scrollToNotifyForm}>
              {tHome("contribute")}
            </Button>
          </div>
        </div>
      </section>

      {/* Admin link */}
      <section className="w-full border-t border-border/50 py-8">
        <p className="text-center text-sm text-muted-foreground">
          {t("adminPrefix")}{" "}
          <button type="button" onClick={() => { window.location.href = "/login"; }} className="inline-flex items-center gap-1.5 text-primary font-medium hover:underline bg-transparent border-0 cursor-pointer p-0 font-inherit">
            <LogIn className="h-4 w-4" />
            {t("adminLoginLink")}
          </button>
        </p>
      </section>
    </div>
  );
}
