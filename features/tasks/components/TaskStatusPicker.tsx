"use client";

/**
 * TaskStatusPicker — the single, reusable editor for a task's lifecycle
 * status, mirroring TaskPriorityPicker's two looks:
 *   - `variant="pill"`      compact Popover pill (tables, list rows)
 *   - `variant="segmented"` inline segmented control (the full task editor)
 *
 * Vocabulary, labels, icons, and chip styling all come from the canonical
 * registry in `constants/status.ts` — never re-declare them at a callsite.
 */

import React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/cn";
import {
  TASK_STATUSES,
  TASK_STATUS_META,
  normalizeTaskStatus,
  type TaskStatus,
} from "../constants/status";

export function TaskStatusPicker({
  value,
  onChange,
  variant = "pill",
  className,
}: {
  /** Raw DB status is fine — normalized internally. */
  value: string | null | undefined;
  onChange: (value: TaskStatus) => void;
  variant?: "pill" | "segmented";
  className?: string;
}) {
  const status = normalizeTaskStatus(value);

  if (variant === "segmented") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-0.5 p-0.5 rounded-md bg-muted/50 border border-border/60 w-fit flex-wrap",
          className,
        )}
      >
        {TASK_STATUSES.map((s) => {
          const meta = TASK_STATUS_META[s];
          const Icon = meta.icon;
          const active = status === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              title={meta.description}
              className={cn(
                "h-6 px-2 rounded text-[11px] font-medium transition-colors inline-flex items-center gap-1",
                active
                  ? cn("border", meta.chipClass)
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3 w-3" />
              {meta.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <StatusPillPicker value={status} onChange={onChange} className={className} />
  );
}

function StatusPillPicker({
  value,
  onChange,
  className,
}: {
  value: TaskStatus;
  onChange: (value: TaskStatus) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const meta = TASK_STATUS_META[value];
  const Icon = meta.icon;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 h-6 px-1.5 rounded-md border text-[10px] font-medium transition-colors hover:bg-accent",
            meta.chipClass,
            className,
          )}
          title="Set status"
        >
          <Icon className="h-2.5 w-2.5" />
          {meta.label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40 p-1">
        {TASK_STATUSES.map((s) => {
          const optMeta = TASK_STATUS_META[s];
          const OptIcon = optMeta.icon;
          return (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              title={optMeta.description}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-left hover:bg-accent",
                value === s && "bg-accent",
              )}
            >
              <OptIcon className="h-3 w-3 text-muted-foreground" />
              {optMeta.label}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/** Read-only status chip — same vocab, no editing. */
export function TaskStatusChip({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const status = normalizeTaskStatus(value);
  const meta = TASK_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 h-5 px-1.5 rounded-md border text-[10px] font-medium",
        meta.chipClass,
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {meta.label}
    </span>
  );
}
