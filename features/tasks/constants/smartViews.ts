/**
 * Smart views — the canonical saved perspectives over the user's tasks
 * (Inbox / Today / Upcoming / Overdue / Assigned to me / Created by me /
 * Completed), mirroring the best-in-class task apps (Todoist, Things,
 * Linear "My Issues").
 *
 * Each view is a pure predicate over the UI task shape plus a small context
 * object; the registry drives the sidebar section, the filter pipeline in
 * `redux/selectors.ts`, and per-view counts — one definition, every surface.
 */
import {
  ListTodo,
  Inbox,
  Sun,
  CalendarDays,
  AlarmClockOff,
  UserCheck,
  UserPen,
  CircleCheck,
  type LucideIcon,
} from "lucide-react";
import type { TaskWithProject } from "../types";
import { normalizeTaskStatus } from "./status";

export type SmartViewKey =
  | "all"
  | "inbox"
  | "today"
  | "upcoming"
  | "overdue"
  | "assigned_to_me"
  | "created_by_me"
  | "completed";

export interface SmartViewContext {
  /** yyyy-mm-dd in the user's local timezone */
  todayStr: string;
  /** yyyy-mm-dd seven days out */
  weekStr: string;
  currentUserId: string | null;
}

export interface SmartViewDef {
  key: SmartViewKey;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Completed/cancelled/dismissed tasks are dropped before predicates run
   *  unless the view opts in. */
  includesClosed?: boolean;
  predicate: (task: TaskWithProject, ctx: SmartViewContext) => boolean;
}

export const SMART_VIEWS: SmartViewDef[] = [
  {
    key: "all",
    label: "All tasks",
    icon: ListTodo,
    description: "Every open task",
    predicate: () => true,
  },
  {
    key: "inbox",
    label: "Inbox",
    icon: Inbox,
    description: "Captured but not yet triaged",
    predicate: (t) => normalizeTaskStatus(t.status) === "inbox",
  },
  {
    key: "today",
    label: "Today",
    icon: Sun,
    description: "Due today or overdue, plus anything started",
    predicate: (t, ctx) =>
      !!t.dueDate && t.dueDate <= ctx.todayStr,
  },
  {
    key: "upcoming",
    label: "Upcoming",
    icon: CalendarDays,
    description: "Due in the next 7 days",
    predicate: (t, ctx) =>
      !!t.dueDate && t.dueDate > ctx.todayStr && t.dueDate <= ctx.weekStr,
  },
  {
    key: "overdue",
    label: "Overdue",
    icon: AlarmClockOff,
    description: "Past their due date",
    predicate: (t, ctx) => !!t.dueDate && t.dueDate < ctx.todayStr,
  },
  {
    key: "assigned_to_me",
    label: "Assigned to me",
    icon: UserCheck,
    description: "Tasks where you are the assignee",
    predicate: (t, ctx) =>
      !!ctx.currentUserId && t.assigneeId === ctx.currentUserId,
  },
  {
    key: "created_by_me",
    label: "Created by me",
    icon: UserPen,
    description: "Tasks you created",
    predicate: (t, ctx) =>
      !!ctx.currentUserId && t.userId === ctx.currentUserId,
  },
  {
    key: "completed",
    label: "Completed",
    icon: CircleCheck,
    description: "Recently completed (last 90 days)",
    includesClosed: true,
    predicate: (t) => {
      if (normalizeTaskStatus(t.status) !== "completed") return false;
      const doneAt = t.completedAt ?? t.updatedAt;
      if (!doneAt) return true;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      return new Date(doneAt) >= cutoff;
    },
  },
];

export const SMART_VIEW_BY_KEY: Record<SmartViewKey, SmartViewDef> =
  Object.fromEntries(SMART_VIEWS.map((v) => [v.key, v])) as Record<
    SmartViewKey,
    SmartViewDef
  >;

export function buildSmartViewContext(
  currentUserId: string | null,
): SmartViewContext {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const week = new Date(today);
  week.setDate(week.getDate() + 7);
  const toStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return { todayStr: toStr(today), weekStr: toStr(week), currentUserId };
}
