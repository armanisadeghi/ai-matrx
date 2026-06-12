"use client";

/**
 * TaskPriorityPicker — the single, reusable editor for a task's priority.
 *
 * One primitive, two looks (so every surface shares the same colors, options,
 * and `null`-handling instead of re-implementing it):
 *   - `variant="pill"`      compact Popover pill (the project task table)
 *   - `variant="segmented"` inline segmented control (the full task editor)
 *
 * Value is the DB shape directly: `"low" | "medium" | "high" | null`.
 * Styling vocab lives in `TASK_PRIORITY_META` and is exported so read-only
 * displays (meta chips, previews) stay in lockstep with the editor.
 */

import React from "react";
import { Flag } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/cn";

export type TaskPriority = "low" | "medium" | "high" | null;

/** Shared priority styling vocab — colors are consistent app-wide (red/amber/sky). */
export const TASK_PRIORITY_META: Record<
  "low" | "medium" | "high",
  {
    label: string;
    /** Abbreviated label for tight segmented controls. */
    shortLabel: string;
    /** Foreground color only. */
    text: string;
    /** Tinted fill + border, for an "active" segmented chip. */
    fill: string;
    /** Combined border + subtle fill + text, for a standalone pill. */
    pill: string;
    /** Flag-icon accent color, for menu rows. */
    accent: string;
  }
> = {
  high: {
    label: "High",
    shortLabel: "High",
    text: "text-red-600 dark:text-red-400",
    fill: "bg-red-500/10 border-red-500/40",
    pill: "text-red-600 dark:text-red-400 border-red-300 dark:border-red-800 bg-red-500/5",
    accent: "text-red-500",
  },
  medium: {
    label: "Medium",
    shortLabel: "Med",
    text: "text-amber-600 dark:text-amber-400",
    fill: "bg-amber-500/10 border-amber-500/40",
    pill: "text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800 bg-amber-500/5",
    accent: "text-amber-500",
  },
  low: {
    label: "Low",
    shortLabel: "Low",
    text: "text-sky-600 dark:text-sky-400",
    fill: "bg-sky-500/10 border-sky-500/40",
    pill: "text-sky-600 dark:text-sky-400 border-sky-300 dark:border-sky-800 bg-sky-500/5",
    accent: "text-sky-500",
  },
};

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; short: string }[] =
  [
    { value: null, label: "None", short: "None" },
    { value: "low", label: "Low", short: "Low" },
    { value: "medium", label: "Medium", short: "Med" },
    { value: "high", label: "High", short: "High" },
  ];

export function TaskPriorityPicker({
  value,
  onChange,
  variant = "pill",
}: {
  value: TaskPriority;
  onChange: (value: TaskPriority) => void;
  variant?: "pill" | "segmented";
}) {
  if (variant === "segmented") {
    return (
      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-muted/50 border border-border/60 w-fit">
        {PRIORITY_OPTIONS.map((opt) => {
          const active = value === opt.value;
          const meta = opt.value ? TASK_PRIORITY_META[opt.value] : null;
          return (
            <button
              key={opt.value ?? "none"}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "h-6 px-2 rounded text-[11px] font-medium transition-colors",
                active
                  ? meta
                    ? `${meta.fill} ${meta.text}`
                    : "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.short}
            </button>
          );
        })}
      </div>
    );
  }

  return <PriorityPillPicker value={value} onChange={onChange} />;
}

function PriorityPillPicker({
  value,
  onChange,
}: {
  value: TaskPriority;
  onChange: (value: TaskPriority) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const meta = value ? TASK_PRIORITY_META[value] : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 h-6 px-1.5 rounded-md border text-[10px] font-medium transition-colors hover:bg-accent",
            meta
              ? meta.pill
              : "border-transparent text-muted-foreground/50 hover:text-foreground",
          )}
          title="Set priority"
        >
          <Flag className="h-2.5 w-2.5" />
          {meta ? meta.label : "—"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-32 p-1">
        {PRIORITY_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value ?? "none"}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-left hover:bg-accent",
                active && "bg-accent",
              )}
            >
              <Flag
                className={cn(
                  "h-3 w-3",
                  opt.value
                    ? TASK_PRIORITY_META[opt.value].accent
                    : "text-muted-foreground/40",
                )}
              />
              {opt.label}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
