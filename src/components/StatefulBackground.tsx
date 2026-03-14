import { cn } from "@/lib/utils";

/** Animated background that reflects server state: running = livelier motion and tint, stopped = calmer. Used on Server tab and Advisor tab for consistent look. */
export function StatefulBackground({ running = false }: { running?: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <style>{`
        @keyframes state-bg-drift {
          0%, 100% { background-position: 0% 0%; }
          50% { background-position: 100% 100%; }
        }
      `}</style>
      <div
        className={cn(
          "absolute inset-0 dark:opacity-[0.08]",
          running ? "opacity-[0.05]" : "opacity-[0.03]"
        )}
        style={{
          background: running
            ? "radial-gradient(ellipse 120% 80% at 50% 20%, hsl(var(--primary)) 0%, transparent 50%), radial-gradient(ellipse 80% 120% at 80% 80%, hsl(142 76% 36%) 0%, transparent 45%)"
            : "radial-gradient(ellipse 100% 100% at 30% 30%, hsl(var(--primary) / 0.8) 0%, transparent 50%), radial-gradient(ellipse 80% 80% at 70% 70%, hsl(var(--muted-foreground) / 0.3) 0%, transparent 50%)",
          backgroundSize: "200% 200%",
          animation: running ? "state-bg-drift 18s ease-in-out infinite" : "state-bg-drift 35s ease-in-out infinite",
        }}
      />
      <div
        className="absolute inset-0 opacity-0"
        style={{
          backgroundImage: "radial-gradient(circle at 20% 80%, hsl(var(--primary)) 0%, transparent 40%), radial-gradient(circle at 80% 20%, hsl(var(--primary)) 0%, transparent 40%)",
          backgroundSize: "200% 200%",
          animation: "state-bg-drift 25s ease-in-out infinite reverse",
        }}
      />
    </div>
  );
}
