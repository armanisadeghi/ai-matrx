import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { PIPELINE_STEPS } from "../types";
import {
  pipelineProgressTitle,
  type NodePipelineProgress,
} from "../lib/pipeline-progress";

const TONE_CLASSES: Record<NodePipelineProgress["tone"], string> = {
  muted: "border-border bg-muted text-muted-foreground",
  primary: "border-primary/40 bg-primary/10 text-primary",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
};

const DOT_CLASSES: Record<NodePipelineProgress["tone"], string> = {
  muted: "bg-muted-foreground",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

/** The shared pipeline summary badge: dense for tree rows, labeled for tables. */
export function PipelineProgressBadge({
  progress,
  dense = false,
}: {
  progress: NodePipelineProgress;
  dense?: boolean;
}) {
  const title = pipelineProgressTitle(progress);
  if (dense) {
    return (
      <span
        className={cn(
          "ml-1.5 inline-flex items-center gap-1 rounded border px-1 align-middle text-[10px] font-medium tabular-nums leading-4",
          TONE_CLASSES[progress.tone],
        )}
        title={`Pipeline: ${title}`}
      >
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASSES[progress.tone])}
        />
        {progress.doneCount}/{PIPELINE_STEPS.length}
      </span>
    );
  }

  const label =
    progress.failedCount > 0
      ? `${progress.failedCount} failed · ${progress.doneCount}/${PIPELINE_STEPS.length}`
      : progress.unknownCount > 0
        ? `Mismatch · ${progress.doneCount}/${PIPELINE_STEPS.length}`
        : `${progress.filterLabel} · ${progress.doneCount}/${PIPELINE_STEPS.length}`;

  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap px-1.5 text-[10px] font-medium",
        TONE_CLASSES[progress.tone],
      )}
      title={`Pipeline: ${title}`}
    >
      {label}
    </Badge>
  );
}
