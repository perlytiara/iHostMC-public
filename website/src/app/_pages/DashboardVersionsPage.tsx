"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { getPath, type Locale } from "@/i18n/pathnames";
import { Link } from "@/i18n/navigation";
import { ChevronLeft, Tag, Camera, Send, Upload, FileText } from "lucide-react";

type VersionsTabId = "versioning" | "snapshot";

export default function DashboardVersionsPage() {
  const locale = useLocale() as Locale;
  const [tab, setTab] = useState<VersionsTabId>("versioning");

  const TABS: { id: VersionsTabId; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "versioning", label: "Versioning", Icon: Tag },
    { id: "snapshot", label: "Snapshot", Icon: Camera },
  ];

  return (
    <div className="space-y-6">
      <Link
        href={getPath("dashboard", locale)}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Back to Dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Versions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Push new versions, send messages to your custom client, and control how updates are delivered on the website and in the app.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {tab === "versioning" && (
        <section className="rounded-xl border border-border bg-card/50 p-6 space-y-6">
          <div>
            <h2 className="font-semibold text-lg">Versioning</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Make new versions available through the website and the app. Push updates; the app and custom clients receive version info and can prompt users to update.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Upload className="h-4 w-4" aria-hidden />
                Publish version
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Set version number and release notes. Updates appear on the website and in the app; push notifications can be sent when you publish.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FileText className="h-4 w-4" aria-hidden />
                Format &amp; references
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Define version format (e.g. semver) and reference docs or changelog. Custom clients can use these to show update prompts and release notes.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Send className="h-4 w-4" aria-hidden />
              Messages to custom client
            </h3>
            <p className="text-xs text-muted-foreground mt-2 mb-3">
              If you build a custom client, you can send messages here (e.g. update prompts, release notes). They can scroll or display in-app; format and references are included so your client can render them.
            </p>
            <textarea
              readOnly
              placeholder="Message content (API coming soon)"
              className="w-full min-h-[100px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground placeholder:text-muted-foreground/70 resize-y"
              rows={3}
            />
          </div>
        </section>
      )}

      {tab === "snapshot" && (
        <section className="rounded-xl border border-border bg-card/50 p-6 space-y-6">
          <div>
            <h2 className="font-semibold text-lg">Snapshot</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Snapshot of the current version state: format, references, and metadata. Same structure as Versioning so you can send snapshots to your custom client (scroll, messages, update prompts). Update on the website and in the app, then push; clients receive the snapshot.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Camera className="h-4 w-4" aria-hidden />
                Current snapshot
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                View the live version snapshot (version, format, references). This is what the app and custom clients see when they check for updates.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Send className="h-4 w-4" aria-hidden />
                Send to custom client
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Push snapshot data to your custom client. Messages and references are formatted so the client can display them (e.g. scroll, in-app banner). Updates you make here sync to the website and app.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h3 className="text-sm font-medium text-foreground">Format &amp; references</h3>
            <p className="text-xs text-muted-foreground mt-2">
              Snapshot uses the same format and reference fields as Versioning. Update version info on the website and in the app, then push; the snapshot is what gets delivered to clients.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
