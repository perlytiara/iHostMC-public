"use client";

import { AdvisorLayout } from "./AdvisorLayout";

export interface AiPageProps {
  onOpenAccount?: () => void;
}

export default function AiPage({ onOpenAccount }: AiPageProps) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[hsl(var(--background))]">
      <AdvisorLayout onOpenAccount={onOpenAccount} />
    </div>
  );
}
