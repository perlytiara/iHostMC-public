/**
 * Compact loading skeleton for dashboard sub-pages (Account, Settings, Servers, Backups).
 * Keeps the dashboard feeling responsive instead of raw "Loading…" text.
 */
export function DashboardLoadingBlock() {
  return (
    <div className="space-y-4 animate-in fade-in duration-200" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <div className="h-6 w-40 rounded-md bg-muted/60" />
        <div className="h-4 w-64 max-w-full rounded-md bg-muted/40" />
      </div>
      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
        <div className="h-4 w-full rounded bg-muted/40" />
        <div className="h-4 w-4/5 rounded bg-muted/30" />
        <div className="h-10 w-32 rounded-lg bg-muted/50 mt-4" />
      </div>
    </div>
  );
}
