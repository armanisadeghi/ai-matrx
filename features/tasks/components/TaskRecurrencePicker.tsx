"use client";

/**
 * TaskRecurrencePicker — preset-based editor for workspace.tasks.recurrence_rule
 * (the RRULE subset in utils/recurrence.ts). Completing a recurring task rolls
 * its due date forward instead of closing it — see taskService.completeTask.
 */

import React from "react";
import { Repeat } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/cn";
import { describeRecurrenceRule } from "../utils/recurrence";

const PRESETS: { rule: string | null; label: string }[] = [
  { rule: null, label: "Does not repeat" },
  { rule: "FREQ=DAILY", label: "Every day" },
  { rule: "FREQ=WEEKLY", label: "Every week" },
  { rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", label: "Every weekday" },
  { rule: "FREQ=WEEKLY;INTERVAL=2", label: "Every 2 weeks" },
  { rule: "FREQ=MONTHLY", label: "Every month" },
  { rule: "FREQ=MONTHLY;INTERVAL=3", label: "Every quarter" },
  { rule: "FREQ=YEARLY", label: "Every year" },
];

export function TaskRecurrencePicker({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (rule: string | null) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const description = describeRecurrenceRule(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 h-6 px-1.5 rounded-md border text-[10px] font-medium transition-colors hover:bg-accent",
            description
              ? "text-foreground border-border bg-muted/40"
              : "border-transparent text-muted-foreground/50 hover:text-foreground",
            className,
          )}
          title="Set repeat"
        >
          <Repeat className="h-2.5 w-2.5" />
          {description ?? "—"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1">
        {PRESETS.map((p) => {
          const active = (value ?? null) === p.rule;
          return (
            <button
              key={p.rule ?? "none"}
              type="button"
              onClick={() => {
                onChange(p.rule);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-left hover:bg-accent",
                active && "bg-accent",
              )}
            >
              <Repeat
                className={cn(
                  "h-3 w-3",
                  p.rule ? "text-muted-foreground" : "text-muted-foreground/40",
                )}
              />
              {p.label}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
