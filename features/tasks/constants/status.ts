/**
 * Canonical task lifecycle vocabulary — the ONE place status semantics live.
 *
 * DB: workspace.tasks.status, CHECK-constrained to this set plus the legacy
 * 'incomplete' (still written by pre-cutover clients; normalized on read).
 *
 * Lifecycle: inbox → planned → active → completed, with cancelled/dismissed
 * as terminal side-exits. "Open" = any non-terminal status.
 */
import {
  Inbox,
  CalendarClock,
  CirclePlay,
  CircleCheck,
  CircleX,
  BellOff,
  type LucideIcon,
} from "lucide-react";

export const TASK_STATUSES = [
  "inbox",
  "planned",
  "active",
  "completed",
  "cancelled",
  "dismissed",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Terminal statuses — the task no longer needs attention. */
export const CLOSED_TASK_STATUSES: readonly TaskStatus[] = [
  "completed",
  "cancelled",
  "dismissed",
];

export interface TaskStatusMeta {
  value: TaskStatus;
  label: string;
  icon: LucideIcon;
  /** Semantic-token classes for chips/pills (no raw colors). */
  chipClass: string;
  description: string;
}

export const TASK_STATUS_META: Record<TaskStatus, TaskStatusMeta> = {
  inbox: {
    value: "inbox",
    label: "Inbox",
    icon: Inbox,
    chipClass: "bg-muted text-muted-foreground border-border",
    description: "Captured, not yet triaged",
  },
  planned: {
    value: "planned",
    label: "Planned",
    icon: CalendarClock,
    chipClass:
      "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
    description: "Triaged and scheduled or slotted into a project",
  },
  active: {
    value: "active",
    label: "In progress",
    icon: CirclePlay,
    chipClass:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
    description: "Being worked on right now",
  },
  completed: {
    value: "completed",
    label: "Completed",
    icon: CircleCheck,
    chipClass:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    description: "Done",
  },
  cancelled: {
    value: "cancelled",
    label: "Cancelled",
    icon: CircleX,
    chipClass: "bg-muted text-muted-foreground border-border line-through",
    description: "Will not be done",
  },
  dismissed: {
    value: "dismissed",
    label: "Dismissed",
    icon: BellOff,
    chipClass: "bg-muted text-muted-foreground border-border",
    description: "Acknowledged and set aside (system-created tasks)",
  },
};

/** Order used when grouping / sorting by status. */
export const TASK_STATUS_ORDER: Record<TaskStatus, number> = {
  active: 0,
  planned: 1,
  inbox: 2,
  completed: 3,
  cancelled: 4,
  dismissed: 5,
};

/**
 * Normalize any raw DB status string (including legacy 'incomplete' and any
 * stray historical value) onto the canonical vocabulary. Unknown open-ish
 * values map to 'inbox' — never silently to a terminal status.
 */
export function normalizeTaskStatus(raw: string | null | undefined): TaskStatus {
  switch (raw) {
    case "inbox":
    case "planned":
    case "active":
    case "completed":
    case "cancelled":
    case "dismissed":
      return raw;
    case "incomplete":
    case "not_started":
    case "pending":
      return "inbox";
    case "in_progress":
      return "active";
    case "done":
    case "complete":
      return "completed";
    default:
      return "inbox";
  }
}

export function isClosedStatus(raw: string | null | undefined): boolean {
  const s = normalizeTaskStatus(raw);
  return s === "completed" || s === "cancelled" || s === "dismissed";
}

export function isOpenStatus(raw: string | null | undefined): boolean {
  return !isClosedStatus(raw);
}

/** Task provenance: who/what created it. */
export type TaskOrigin = "user" | "agent" | "system";
