/**
 * Row types and result envelopes for the UI-first tools system.
 *
 * Row types mirror the `chat` schema shapes. Hand-typed (rather than pulled
 * from `database.types.ts`) because `steps`/`value` come back as `Json` from
 * the generator and every consumer here wants the narrowed shape. Because
 * they are hand-mirrored, the type gate does NOT catch column renames —
 * compare against the live table whenever the schema changes.
 *
 * Ownership is `created_by` (canonical, stamped by the `_stamp_actor`
 * trigger). `chat.agent_task` has no owner uuid of its own: it is owned
 * through its parent conversation, and its `creator_kind` enum records who
 * AUTHORED the task (agent vs user), never who owns it.
 */

import type { TaskStatus } from "./schemas";

// ─── Row types — mirror the DB schemas in migrations/cx_agent_lists.sql ──────

export type CxPlanStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "superseded";

export type CxAgentTaskStatus = NonNullable<TaskStatus>;

export type CxAgentTaskCreator = "agent" | "user";

export interface CxAgentPlanRow {
  id: string;
  conversation_id: string;
  created_by: string | null;
  title: string;
  steps: string[];
  reasoning: string | null;
  domains: string[] | null;
  estimated_minutes: number | null;
  status: CxPlanStatus;
  created_at: string;
  updated_at: string;
}

export interface CxAgentTaskRow {
  id: string;
  conversation_id: string;
  plan_id: string | null;
  title: string;
  status: CxAgentTaskStatus;
  note: string | null;
  position: number;
  /** Who authored the task — NOT an owner. Owner is the parent conversation. */
  creator_kind: CxAgentTaskCreator | null;
  created_at: string;
  updated_at: string;
}

export interface CxUserTodoRow {
  id: string;
  conversation_id: string;
  created_by: string | null;
  title: string;
  context: string | null;
  due: string | null;
  done: boolean;
  done_at: string | null;
  ctx_task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CxAgentMemoryRow {
  conversation_id: string;
  user_id: string;
  key: string;
  value: unknown;
  updated_at: string;
}

export interface AgentUserKvRow {
  user_id: string;
  key: string;
  value: unknown;
  updated_at: string;
}

// ─── Tool result envelopes (what the handlers POST back to /tool_results) ───

export interface TasksResult {
  ok: boolean;
  action: string;
  tasks: Array<{
    id: string;
    title: string;
    status: CxAgentTaskStatus;
    note: string | null;
  }>;
  created?: Array<{ id: string; title: string; status: CxAgentTaskStatus }>;
  removed?: string[];
  message?: string;
}

export interface UserTodosResult {
  ok: boolean;
  action: string;
  open: Array<{
    id: string;
    title: string;
    context: string | null;
    due: string | null;
  }>;
  recent_done: Array<{ id: string; title: string; done_at: string }>;
  created?: Array<{ id: string; title: string }>;
  removed?: string[];
  message?: string;
}

export interface PlanResultEnvelope {
  ok: boolean;
  plan: {
    id: string;
    title: string;
    steps: string[];
    status: CxPlanStatus;
    reasoning: string | null;
  } | null;
  status: CxPlanStatus | null;
  cancelled: boolean;
  timed_out: boolean;
}

export interface MemoryResult {
  ok: boolean;
  action: string;
  key?: string;
  value?: unknown;
  keys?: string[];
  message?: string;
}

export type StorageResult = MemoryResult;
