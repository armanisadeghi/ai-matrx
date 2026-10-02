import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { resultAsObject, getArg } from "../_shared";

/**
 * Parsers for the task-family tools.
 *
 * - `task` (singular) is a real `ctx_tasks` row → `{ id, title, status,
 *   priority, updated_at }`. Deep-linkable (window + /tasks/[id]).
 * - `tasks` / `user_todos` are the agent's lightweight working list / personal
 *   todos (NOT ctx_tasks): `{ tasks:[{id,title,status,note}] }` /
 *   `{ open:[{id,title,context,due}], recent_done:[...] }`. Rendered as a
 *   checklist; no per-item deep link.
 */

const asStr = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

export interface ParsedTask {
  id: string | null;
  title: string | null;
  status: string | null;
  priority: string | null;
}

export function parseSingleTask(entry: ToolLifecycleEntry): ParsedTask {
  const r = resultAsObject(entry) ?? {};
  return {
    id: asStr(r.id) ?? asStr(getArg<string>(entry, "task_id")),
    title: asStr(r.title) ?? asStr(getArg<string>(entry, "title")),
    status: asStr(r.status),
    priority: asStr(r.priority),
  };
}

export interface ParsedTaskItem {
  id?: string;
  title: string;
  /** Normalized: "done" | "in_progress" | "open". */
  status: string;
  note?: string | null;
  due?: string | null;
}

export interface ParsedTaskCollection {
  action: string | null;
  items: ParsedTaskItem[];
}

function normStatus(raw: unknown, fallback: string): string {
  const s = typeof raw === "string" ? raw.toLowerCase() : "";
  if (s === "done" || s === "completed" || s === "complete") return "done";
  if (s === "in_progress" || s === "in progress" || s === "doing")
    return "in_progress";
  if (s === "open" || s === "incomplete" || s === "todo" || s === "pending")
    return "open";
  return fallback;
}

export function parseTaskCollection(
  entry: ToolLifecycleEntry,
): ParsedTaskCollection {
  const r = resultAsObject(entry) ?? {};
  const action = asStr(r.action);
  const items: ParsedTaskItem[] = [];

  const toItem = (t: unknown, fallbackStatus: string): ParsedTaskItem | null => {
    if (!t || typeof t !== "object") return null;
    const o = t as Record<string, unknown>;
    const title = asStr(o.title);
    if (!title) return null;
    return {
      id: asStr(o.id) ?? undefined,
      title,
      status: normStatus(o.status, fallbackStatus),
      note: asStr(o.note) ?? asStr(o.context),
      due: asStr(o.due) ?? asStr(o.due_date),
    };
  };

  // `tasks` tool: a single current list under `tasks`.
  if (Array.isArray(r.tasks)) {
    for (const t of r.tasks) {
      const item = toItem(t, "open");
      if (item) items.push(item);
    }
  } else {
    // `user_todos` tool: open list + recently-done list.
    for (const t of Array.isArray(r.open) ? r.open : []) {
      const item = toItem(t, "open");
      if (item) items.push(item);
    }
    for (const t of Array.isArray(r.recent_done) ? r.recent_done : []) {
      const item = toItem(t, "done");
      if (item) items.push({ ...item, status: "done" });
    }
  }

  return { action, items };
}
