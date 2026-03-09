"use client";

import { ServerDashboard } from "./ServerDashboard";

interface ServerControlProps {
  visible: boolean;
  isRunning: boolean;
}

export function ServerControl({ visible, isRunning }: ServerControlProps) {
  if (!visible) return null;

  return (
    <div className="flex h-full min-h-[300px] flex-col gap-4">
      <ServerDashboard isRunning={isRunning} />
    </div>
  );
}
