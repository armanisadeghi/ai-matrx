"use client";

import { cn } from "@/lib/utils";
import { Favicon } from "./Favicon";
import { StatusDot, STATUS_TEXT_CLASS, STATUS_LABELS } from "./StatusDot";
import type { ItemStatus } from "../../../../hooks/usePipelineProgress";

interface Props {
  status: ItemStatus;
  label: string;
  hostname?: string;
  /** Right-aligned secondary string, e.g. "12.3 KB". */
  meta?: React.ReactNode;
  /** Below-label slot for badges, chips, sub-meta. */
  badges?: React.ReactNode;
  /** Optional small progress (e.g. "page 3/5") rendered inline near label. */
  progress?: React.ReactNode;
  /** Optional slot at far right (overflow menu, action button). */
  trailing?: React.ReactNode;
  /** Make the card highlighted when status is active. */
  className?: string;
}

export function WorkItemCard({
  status,
  label,
  hostname,
  meta,
  badges,
  progress,
  trailing,
  className,
}: Props) {
  const isActive = status === "active";
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-2.5 py-1.5 transition-colors",
        "border-border/60 bg-card/40",
        isActive && "border-primary/40 bg-primary/5",
        className,
      )}
    >
      <Favicon hostname={hostname} size={14} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusDot status={status} />
          <span
            className={cn(
              "type-secondary font-medium truncate",
              status === "dead_link" && "line-through opacity-70",
            )}
          >
            {label}
          </span>
          {progress && (
            <span className="type-meta text-muted-foreground tabular-nums shrink-0 ml-auto">
              {progress}
            </span>
          )}
          {meta && !progress && (
            <span className="type-meta text-muted-foreground tabular-nums shrink-0 ml-auto">
              {meta}
            </span>
          )}
        </div>
        {(badges || hostname || (meta && progress)) && (
          <div className="mt-0.5 flex items-center gap-1 flex-wrap">
            {hostname && (
              <span className="type-meta text-muted-foreground/80 truncate max-w-[160px]">
                {hostname}
              </span>
            )}
            {badges}
            {meta && progress && (
              <span className="type-meta text-muted-foreground tabular-nums ml-auto">
                {meta}
              </span>
            )}
            {!hostname && !badges && !meta && (
              <span
                className={cn(
                  "type-meta capitalize",
                  STATUS_TEXT_CLASS[status],
                )}
              >
                {STATUS_LABELS[status]}
              </span>
            )}
          </div>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
