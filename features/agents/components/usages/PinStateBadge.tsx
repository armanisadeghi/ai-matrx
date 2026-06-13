/**
 * Pin-state badge — "Follows active" vs "Pinned vN" (tinted when stale).
 */

"use client";

import { GitBranch, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentUsageRow } from "@/features/agents/redux/usages/usages.types";

export function PinStateBadge({ row }: { row: Pick<AgentUsageRow, "pinMode" | "pinnedVersionNumber" | "stalePin" | "currentVersion"> }) {
  if (row.pinMode === "follow_active") {
    return (
      <span
        title="Tracks the agent's active version automatically"
        className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap"
      >
        <GitBranch className="h-3 w-3" aria-hidden />
        Follows active
      </span>
    );
  }
  const stale = row.stalePin;
  return (
    <span
      title={
        stale
          ? `Pinned to v${row.pinnedVersionNumber} — active is v${row.currentVersion}`
          : `Pinned to v${row.pinnedVersionNumber} (the active version)`
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        stale
          ? "border-warning/30 bg-warning/5 text-warning"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      <Pin className="h-3 w-3" aria-hidden />
      Pinned v{row.pinnedVersionNumber}
    </span>
  );
}
