"use client";

// features/education/classes/components/assignmentDisplay.tsx
//
// Shared presentational primitives for assignment completion — the ONE place
// status/score/due-date render, so the owner grid, the per-student drill, and the
// member "Assigned to you" list all read identically.

import { CheckCircle2, Circle, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysUntil } from "../settings";
import type { AssignmentStatus } from "../types";

const STATUS_META: Record<
  AssignmentStatus,
  { label: string; dot: string; text: string; Icon: typeof CheckCircle2 }
> = {
  completed: {
    label: "Completed",
    dot: "bg-green-500",
    text: "text-green-600 dark:text-green-400",
    Icon: CheckCircle2,
  },
  in_progress: {
    label: "In progress",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    Icon: CircleDashed,
  },
  not_started: {
    label: "Not started",
    dot: "bg-muted-foreground/30",
    text: "text-muted-foreground",
    Icon: Circle,
  },
};

export function statusMeta(status: AssignmentStatus) {
  return STATUS_META[status];
}

/** A pill with an icon + label for one completion status. */
export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  const m = STATUS_META[status];
  const Icon = m.Icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", m.text)}>
      <Icon className="h-3.5 w-3.5" />
      {m.label}
    </span>
  );
}

/** A compact score pill (0-100), color-graded, or a muted dash when unattempted. */
export function ScorePill({ scorePct }: { scorePct: number | null }) {
  if (scorePct == null) {
    return <span className="text-xs tabular-nums text-muted-foreground">—</span>;
  }
  const tone =
    scorePct >= 80
      ? "text-green-600 dark:text-green-400"
      : scorePct >= 50
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";
  return (
    <span className={cn("text-xs font-semibold tabular-nums", tone)}>
      {scorePct}%
    </span>
  );
}

/** A grid cell: a status dot + optional score, for the roster × assignment grid. */
export function ProgressCell({
  status,
  scorePct,
}: {
  status: AssignmentStatus;
  scorePct: number | null;
}) {
  const m = STATUS_META[status];
  return (
    <div className="flex flex-col items-center justify-center gap-0.5" title={m.label}>
      <span className={cn("h-2.5 w-2.5 rounded-full", m.dot)} />
      {scorePct != null && (
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {scorePct}%
        </span>
      )}
    </div>
  );
}

/** "Due Mar 3 · in 5d" / "Due Mar 3 · past" / "No due date", with urgency tone. */
export function DueDateLabel({
  dueDate,
  className,
}: {
  dueDate: string | null;
  className?: string;
}) {
  if (!dueDate) {
    return (
      <span className={cn("text-[11px] text-muted-foreground", className)}>
        No due date
      </span>
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  const days = daysUntil(dueDate, today);
  const tone =
    days < 0
      ? "text-muted-foreground"
      : days <= 2
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  return (
    <span className={cn("text-[11px]", tone, className)}>
      Due {dueDate}
      {days < 0 ? " · past" : days === 0 ? " · today" : ` · in ${days}d`}
    </span>
  );
}
