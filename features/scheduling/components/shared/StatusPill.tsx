// features/scheduling/components/shared/StatusPill.tsx

"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RunStatus } from "../../types";

const STATUS_STYLES: Record<RunStatus, string> = {
  queued:
    "bg-muted text-muted-foreground border border-border",
  claimed:
    "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900",
  running:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900",
  success:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900",
  failed:
    "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900",
  cancelled:
    "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700",
  skipped:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800",
};

const LABEL: Record<RunStatus, string> = {
  queued: "Queued",
  claimed: "Claimed",
  running: "Running",
  success: "Success",
  failed: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
};

interface Props {
  status: RunStatus;
  className?: string;
}

export function StatusPill({ status, className }: Props) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
    >
      {LABEL[status]}
    </Badge>
  );
}
