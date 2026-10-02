"use client";

import { Loader2 } from "lucide-react";

type StatusPhase = "connecting" | "planning" | "streaming" | "idle";

interface StatusCardProps {
  phase: StatusPhase;
}

const PHASE_LABELS: Record<StatusPhase, string> = {
  connecting: "Connecting...",
  planning: "Planning...",
  streaming: "Generating...",
  idle: "Waiting...",
};

export function StatusCard({ phase }: StatusCardProps) {
  return (
    <div className="w-72 bg-card border border-border rounded-xl shadow-sm animate-in slide-in-from-bottom-2 duration-200 overflow-hidden">
      <div className="px-3 py-3 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
        <div className="flex-1 space-y-1.5">
          <span className="text-xs text-muted-foreground">
            {PHASE_LABELS[phase]}
          </span>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-2/3 rounded-full bg-primary/30 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
