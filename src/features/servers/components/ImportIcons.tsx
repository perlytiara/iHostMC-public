"use client";

import { cn } from "@/lib/utils";

const iconClass = "size-5 shrink-0";

export function IconServerGlobe({ className }: { className?: string }) {
  return (
    <svg
      className={cn(iconClass, className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M2 12h20" />
    </svg>
  );
}

export function IconPlug({ className }: { className?: string }) {
  return (
    <svg
      className={cn(iconClass, className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
      <path d="M6 16v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2" />
      <path d="M6 8h12v8H6z" />
    </svg>
  );
}

export function IconImportArrow({ className }: { className?: string }) {
  return (
    <svg
      className={cn(iconClass, className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M8 21h8" />
      <path d="M4 17v-2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function IconSparkle({ className }: { className?: string }) {
  return (
    <svg
      className={cn(iconClass, className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

export function IconBack({ className }: { className?: string }) {
  return (
    <svg
      className={cn(iconClass, className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

export function IconLoader({ className }: { className?: string }) {
  return (
    <svg
      className={cn(iconClass, "animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
    </svg>
  );
}
