"use client";

import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  className?: string;
  /** Thick ring (Cursor-style) when true */
  thick?: boolean;
}

export function LoadingSpinner({ className, thick = true }: LoadingSpinnerProps) {
  return (
    <div
      className={cn("animate-spin rounded-full border-2 border-muted border-t-primary", thick && "border-[3px] sm:border-[4px]", className)}
      role="status"
      aria-label="Loading"
    />
  );
}

/** Inline loading text with spinner (e.g. "Connecting…") */
export function LoadingState({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 py-8", className)}>
      <LoadingSpinner className="h-10 w-10" />
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
    </div>
  );
}
