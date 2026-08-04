"use client";

/**
 * The launch-stage chip — one visual vocabulary for the New Pages tracker.
 * Stage derivation lives in `lib/launch-tracking.ts::launchLifecycle`; this
 * only paints it.
 */

import { cn } from "@/lib/utils";
import {
  LAUNCH_STAGE_LABELS,
  type LaunchStage,
} from "@/features/marketing/search-console/lib/launch-tracking";

const STAGE_CLASSES: Record<LaunchStage, string> = {
  not_requested: "bg-muted text-muted-foreground",
  awaiting_first_impression: "bg-warning/15 text-warning",
  live: "bg-success/15 text-success",
};

export function LifecycleChip({ stage }: { stage: LaunchStage }) {
  const meta = LAUNCH_STAGE_LABELS[stage];
  return (
    <span
      title={meta.description}
      className={cn(
        "inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        STAGE_CLASSES[stage],
      )}
    >
      {meta.label}
    </span>
  );
}
