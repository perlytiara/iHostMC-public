"use client";

import { StatefulBackground } from "@/components/StatefulBackground";
import { AdvisorLayout } from "./AdvisorLayout";

export interface AiPageProps {
  onOpenAccount?: () => void;
}

export default function AiPage({ onOpenAccount }: AiPageProps) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <StatefulBackground running={false} />
      <AdvisorLayout onOpenAccount={onOpenAccount} />
    </div>
  );
}
