"use client";

import React from "react";

/**
 * Wraps icon components (e.g. Lucide) so suppressHydrationWarning is passed to the root SVG.
 * Use when icons are in SSR'd client components and a browser extension (e.g. Dark Reader)
 * injects attributes into SVGs on the client, causing hydration mismatch.
 */
export function SafeIcon({ children }: { children: React.ReactElement }) {
  return React.cloneElement(children, {
    suppressHydrationWarning: true,
  } as React.Attributes & { suppressHydrationWarning?: boolean });
}
