/**
 * Matrx Data SDK — the curated, RLS-safe data surface exposed to generated
 * React (inline code blocks, tool UIs, agent apps). Generated code calls
 * `matrx.<namespace>.<method>()` to read/write the user's own data so users can
 * build custom UIs over their tasks, projects, notes, documents, etc.
 *
 * ── Invariants (load-bearing) ───────────────────────────────────────────────
 *  - Runs ENTIRELY as the current user/org/guest through the browser Supabase
 *    client. Every call is subject to RLS at the database. The SDK NEVER uses a
 *    service-role / admin client and NEVER bypasses RLS — privileges are exactly
 *    what the signed-in (or guest) session already has.
 *  - It WRAPS existing feature service layers (e.g. `features/tasks/services`)
 *    rather than re-implementing data access — one data path, not a parallel one.
 *  - Namespaces are additive and stable. Extend by adding methods that delegate
 *    to a feature service; do not inline raw `supabase.from(...)` here.
 *
 * STATUS: spike — read-only `tasks` namespace. Projects / notes / documents and
 * the write surface follow once the capability-manifest + guest-privilege design
 * lands (see features/dynamic-react/FEATURE.md / the SDK plan).
 */

import {
  getUserTasks,
  getTaskById,
  getSubtasks,
} from "@/features/tasks/services/taskService";
import type { DatabaseTask } from "@/features/tasks/types";

export interface MatrxTasksApi {
  /** All tasks the current session can see (RLS-scoped, newest first). */
  list: () => Promise<DatabaseTask[]>;
  /** A single task by id, or null if not visible to this session. */
  get: (taskId: string) => Promise<DatabaseTask | null>;
  /** Subtasks of a given task. */
  subtasks: (taskId: string) => Promise<DatabaseTask[]>;
}

export interface MatrxSdk {
  /** SDK contract version — bump on breaking changes to a namespace. */
  readonly version: string;
  readonly tasks: MatrxTasksApi;
}

/**
 * Builds the `matrx` SDK object injected into the generated-code scope. Stateless
 * and cheap to construct; the underlying services self-resolve the session/user.
 */
export function createMatrxSdk(): MatrxSdk {
  return {
    version: "0.1.0",
    tasks: {
      list: () => getUserTasks(),
      get: (taskId: string) => getTaskById(taskId),
      subtasks: (taskId: string) => getSubtasks(taskId),
    },
  };
}
