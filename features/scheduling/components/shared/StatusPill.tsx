// features/scheduling/components/shared/StatusPill.tsx

"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RunStatus } from "../../types";

const STATUS_STYLES: Record<RunStatus, string> = {
  queued: "border border-border bg-muted text-muted-foreground",
  claimed: "border border-info/40 bg-info/10 text-info",
  running: "border border-warning/40 bg-warning/10 text-warning",
  success: "border border-success/40 bg-success/10 text-success",
  failed: "border border-destructive/40 bg-destructive/10 text-destructive",
  cancelled: "border border-border bg-muted text-muted-foreground",
  skipped: "border border-border bg-muted/60 text-muted-foreground",
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
