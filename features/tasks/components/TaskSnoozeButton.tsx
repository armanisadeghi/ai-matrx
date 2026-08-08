"use client";

/**
 * TaskSnoozeButton — per-user snooze control (workspace.task_user_state).
 * Snoozing hides the task from every attention view (Today/Overdue/Upcoming/
 * Inbox) and silences reminders until the chosen time; the task stays in
 * "All tasks". Preset times come from taskUserStateService.snoozePresets.
 */

import React from "react";
import { AlarmClock, AlarmClockOff } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/cn";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectTaskUserStateMap } from "../redux/taskUiSlice";
import { snoozeTaskThunk } from "../redux/thunks";
import { snoozePresets } from "../services/taskUserStateService";

export function TaskSnoozeButton({
  taskId,
  className,
}: {
  taskId: string;
  className?: string;
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = React.useState(false);
  const userState = useAppSelector(selectTaskUserStateMap)[taskId];
  const snoozedUntil = userState?.snoozedUntil ?? null;
  const isSnoozed = !!snoozedUntil && snoozedUntil > new Date().toISOString();

  const snoozedLabel = isSnoozed
    ? new Date(snoozedUntil).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 h-6 px-1.5 rounded-md border text-[10px] font-medium transition-colors hover:bg-accent",
            isSnoozed
              ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30"
              : "border-transparent text-muted-foreground/60 hover:text-foreground",
            className,
          )}
          title={isSnoozed ? `Snoozed until ${snoozedLabel}` : "Snooze"}
        >
          {isSnoozed ? (
            <AlarmClockOff className="h-2.5 w-2.5" />
          ) : (
            <AlarmClock className="h-2.5 w-2.5" />
          )}
          {isSnoozed ? `Snoozed · ${snoozedLabel}` : "Snooze"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40 p-1">
        {snoozePresets().map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              dispatch(snoozeTaskThunk({ taskId, until: p.until }));
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-left hover:bg-accent"
          >
            <AlarmClock className="h-3 w-3 text-muted-foreground" />
            <span className="flex-1">{p.label}</span>
            <span className="text-[10px] text-muted-foreground/70">
              {p.until.toLocaleString(undefined, {
                weekday: "short",
                hour: "numeric",
              })}
            </span>
          </button>
        ))}
        {isSnoozed && (
          <button
            type="button"
            onClick={() => {
              dispatch(snoozeTaskThunk({ taskId, until: null }));
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-left hover:bg-accent text-foreground"
          >
            <AlarmClockOff className="h-3 w-3 text-muted-foreground" />
            Unsnooze
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
