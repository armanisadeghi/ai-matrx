// features/tasks/realtime/rowContract.ts
//
// THE ONE DESCRIPTION OF A `workspace.tasks` / `workspace.projects` ROW that
// every realtime consumer in this app shares.
//
// Why it is one module and not a copy per consumer: the package's write ledger
// is keyed by `table + id`, and its content-aware echo test compares the
// FINGERPRINT a writer observed against the fingerprint a binding computes for
// the incoming payload. Two consumers of the same table with two different
// fingerprint functions produce two different strings for the same row, so a
// write registered by one is not recognized as an echo by the other — the exact
// "private per-hook copy of the ledger" that `useTaskManager`'s header says was
// deleted. There are two consumers of `workspace.tasks` today (the pickers'
// `useTaskManager` hooks and the /tasks route's `tasksRealtimeMiddleware`), so
// the description they must agree on lives here.
//
// Nothing about CHANNELS lives here — channels are `@ai-matrx/realtime`'s job.

export const TASKS_TABLE = "workspace.tasks";
export const PROJECTS_TABLE = "workspace.projects";

/**
 * Content the app can change on a task/project row — the ledger's echo test.
 *
 * Deliberately one function for both tables: they overlap on most fields and
 * the ledger namespaces by table anyway, so a shared shape costs nothing and
 * removes the chance of the two drifting.
 */
export function workspaceRowFingerprint(row: Record<string, unknown>): string {
  return JSON.stringify([
    row.name ?? null,
    row.title ?? null,
    row.description ?? null,
    row.status ?? null,
    row.priority ?? null,
    row.due_date ?? null,
    row.project_id ?? null,
    row.deleted_at ?? null,
  ]);
}
