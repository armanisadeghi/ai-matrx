"use client";

/**
 * TaskDueDatePicker — the single, reusable editor for a task's due date.
 *
 * Always a Calendar popover with a Clear option (so the picked day is the
 * stored day — see `utils/dateOnly`), in two looks:
 *   - `variant="pill"`  compact inline pill (the project task table)
 *   - `variant="field"` full-width form field (the full task editor)
 *
 * Value is the DB shape directly: a `yyyy-mm-dd` string, or `null`.
 */

import React from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/cn";
import { parseDateOnly, toDateOnly, formatDateOnly } from "@/utils/dateOnly";

export function TaskDueDatePicker({
  value,
  onChange,
  variant = "pill",
  overdue = false,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  variant?: "pill" | "field";
  overdue?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = parseDateOnly(value);

  const trigger =
    variant === "field" ? (
      <button
        type="button"
        className={cn(
          "h-8 w-full inline-flex items-center gap-1.5 bg-card border border-border rounded-md px-2 text-xs outline-none transition-colors hover:border-foreground/30 focus:border-primary/60",
          value
            ? overdue
              ? "text-red-600 dark:text-red-400 font-medium"
              : "text-foreground"
            : "text-muted-foreground",
        )}
        title="Set due date"
      >
        <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
        {value
          ? formatDateOnly(value, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "Set due date"}
      </button>
    ) : (
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 h-6 px-1.5 rounded-md text-[12px] transition-colors hover:bg-accent",
          value
            ? overdue
              ? "text-red-600 dark:text-red-400 font-medium"
              : "text-muted-foreground hover:text-foreground"
            : "text-muted-foreground/40 hover:text-foreground",
        )}
        title="Set due date"
      >
        <CalendarIcon className="h-3 w-3" />
        {value ? formatDateOnly(value) : "—"}
      </button>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          autoFocus
          onSelect={(date) => {
            onChange(date ? toDateOnly(date) : null);
            setOpen(false);
          }}
        />
        {value && (
          <div className="border-t border-border p-1.5">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Clear due date
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
