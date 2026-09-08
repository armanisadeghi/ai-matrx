// features/tasks/redux/tasksRealtimeMiddleware.ts
//
// THE /tasks ROUTE'S REALTIME. Before this file the route had none: the list is
// hydrated by `get_user_full_context` into the agent-context `tasks` slice, and
// nothing subscribed to anything — a second writer's INSERT never appeared
// until a full page reload (probed live 2026-09-07: 248 tasks on screen, an
// EMPTY channel registry, a 13s wait, no row).
//
// The `@ai-matrx/realtime` channel that already existed lives in
// `features/tasks/hooks/useTaskManager.ts` and is mounted only by the two
// pickers (War Room, resource manager), which keep their own `useState` lists
// from `taskService.getUserTasks()`. That wiring cannot serve this route: the
// route reads Redux, and its scope is the RPC's, not `getUserTasks()`'s. So the
// SUBSCRIPTION OWNER here is a middleware — the doctrine's preferred owner
// (skill Rule 4: component effects multiply channels across mounts) — while the
// row description both consumers must agree on is shared, in
// `../realtime/rowContract`.
//
// Everything a channel does is the package's: unique instance topic, the write
// ledger, dedup, the ordered handler queue, jittered reconnect with the 30s
// stability reset, tab-sleep/network awareness, and the `onBackfill` door. None
// of it is re-implemented here and none of it ever may be.
//
// WHAT IS THIS FILE'S JOB — the two things only this route knows:
//
// 1. SCOPE. RLS on `workspace.tasks` is far WIDER than the list: a `pub_read`
//    policy delivers every `visibility='public'` task in the system, and
//    `std_select` adds shared/permission-granted rows. Applying whatever
//    arrives would put tasks on screen that a reload then removes. So every
//    payload is tested against the RPC's own task predicate (not deleted, open
//    or closed-within-90-days, and mine-or-assigned-to-me-or-in-a-project-I-
//    can-see) before it is allowed anywhere near the slice.
//
// 2. WHAT A SINGLE ROW CANNOT ANSWER. The RPC buckets each task under an
//    organization it DERIVES (project's org, or the personal-org constant, or
//    the creator's first shared org). A row already in the slice carries that
//    answer, so an update to it is applied straight from the payload with no
//    network. A row we have never seen — or one whose `project_id` just
//    changed — does not, so it costs exactly one debounced catch-up read. This
//    is the same rule `useProjects` uses for membership-scoped rows, and it is
//    why the list can never show something a reload would not.

import type {
  Middleware,
  ThunkDispatch,
  UnknownAction,
} from "@reduxjs/toolkit";
import {
  currentRealtimeManager,
  defineChannelNamespace,
  subscribeToRealtimeManager,
} from "@ai-matrx/realtime";
import type { RootState } from "@/lib/redux/rootReducer";
import {
  upsertTaskWithLevel,
  removeTaskFromSlice,
  type TaskRecord,
} from "@/features/agent-context/redux/tasksSlice";
import { adjustProjectTaskCount } from "@/features/agent-context/redux/projectsSlice";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import { isClosedStatus } from "@/features/tasks/constants/status";
import {
  TASKS_TABLE,
  workspaceRowFingerprint,
} from "@/features/tasks/realtime/rowContract";

/** Thunk-aware dispatch — the catch-up read is a thunk. */
type TasksDispatch = ThunkDispatch<RootState, unknown, UnknownAction>;

/** One place names this channel. A second, different declaration throws. */
const tasksContextChannel = defineChannelNamespace({
  namespace: "workspace-tasks-context",
  parts: ["userId"],
  description:
    "workspace.tasks rows behind the /tasks route's get_user_full_context list",
});

/**
 * A burst of DISTINCT remote rows deserves ONE catch-up read. List-shaped
 * consumer logic, not realtime plumbing — the package's queue deliberately
 * coalesces nothing, because only the consumer knows what a reload costs.
 */
const REFETCH_DEBOUNCE_MS = 300;

/**
 * The RPC keeps a closed task visible for 90 days after it closed, so a remote
 * "completed" does NOT evict the row — matching `get_user_full_context`.
 */
const CLOSED_TASK_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

let stopChannel: (() => void) | null = null;
let subscribedUserId: string | null = null;
let refetchTimer: ReturnType<typeof setTimeout> | null = null;

function idOf(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" ? id : undefined;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** `coalesce(completed_at, updated_at) > now() - interval '90 days'`. */
function closedRecently(row: Record<string, unknown>): boolean {
  const at = str(row.completed_at) ?? str(row.updated_at);
  if (!at) return false;
  const ms = Date.parse(at);
  // Unparseable — degrade to KEEPING the row, never to silently dropping it.
  if (Number.isNaN(ms)) return true;
  return ms > Date.now() - CLOSED_TASK_WINDOW_MS;
}

/**
 * Does this row belong in `get_user_full_context`'s task set for this user?
 * Mirrors the RPC's `all_tasks` / `personal_tasks_v` predicate.
 */
function inListScope(
  row: Record<string, unknown>,
  userId: string,
  visibleProjectIds: ReadonlySet<string>,
): boolean {
  if (row.deleted_at != null) return false;
  if (isClosedStatus(str(row.status)) && !closedRecently(row)) return false;
  const projectId = str(row.project_id);
  return (
    str(row.created_by) === userId ||
    str(row.assignee_id) === userId ||
    (projectId !== null && visibleProjectIds.has(projectId))
  );
}

/**
 * Build the slice record from a realtime payload. `workspace.tasks` events
 * carry the WHOLE row (description and settings included), so the record is
 * genuinely full-data — recording it as "thin-list" would downgrade an open
 * editor's task and cost it a re-fetch.
 *
 * `organization_id` is the one field the row cannot answer (the RPC derives
 * it), so it is carried over from the record we already hold. Callers only
 * reach here with a row that is already in the slice.
 */
function toTaskRecord(
  row: Record<string, unknown>,
  existing: TaskRecord,
): TaskRecord {
  return {
    ...existing,
    id: existing.id,
    title: str(row.title) ?? existing.title,
    status: str(row.status) ?? existing.status,
    priority: str(row.priority),
    due_date: str(row.due_date),
    assignee_id: str(row.assignee_id),
    project_id: str(row.project_id),
    parent_task_id: str(row.parent_task_id),
    organization_id: existing.organization_id,
    created_by: str(row.created_by),
    origin: str(row.origin),
    source_type: str(row.source_type),
    source_url: str(row.source_url),
    source_label: str(row.source_label),
    start_date: str(row.start_date),
    completed_at: str(row.completed_at),
    updated_at: str(row.updated_at),
    recurrence_rule: str(row.recurrence_rule),
    description: str(row.description),
    settings:
      row.settings && typeof row.settings === "object"
        ? (row.settings as Record<string, unknown>)
        : null,
    created_at: str(row.created_at) ?? existing.created_at ?? null,
    visibility: str(row.visibility) ?? existing.visibility,
  };
}

export const tasksRealtimeMiddleware: Middleware<
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- RTK Middleware DispatchExt default
  {},
  RootState,
  TasksDispatch
> = (storeApi) => {
  function scheduleCatchUp() {
    if (refetchTimer) clearTimeout(refetchTimer);
    refetchTimer = setTimeout(() => {
      refetchTimer = null;
      const state = storeApi.getState();
      if (!state.userAuth?.id || state.userAuth.id !== subscribedUserId) return;
      void storeApi.dispatch(invalidateAndRefetchFullContext());
    }, REFETCH_DEBOUNCE_MS);
  }

  /**
   * Keep the project's open/total counts honest for a change we applied from
   * the payload. Without this a collaborator completing a task leaves the
   * sidebar's badge saying something the list no longer shows — the "screen
   * that lies" this whole file exists to prevent. The catch-up read recomputes
   * them authoritatively on every path that takes one.
   */
  function adjustCounts(
    projectId: string | null,
    openDelta: number,
    totalDelta: number,
  ) {
    if (!projectId) return;
    if (openDelta === 0 && totalDelta === 0) return;
    storeApi.dispatch(
      adjustProjectTaskCount({ projectId, openDelta, totalDelta }),
    );
  }

  function evict(taskId: string) {
    const existing = storeApi.getState().tasks.entities[taskId];
    if (!existing) return;
    adjustCounts(
      existing.project_id,
      isClosedStatus(existing.status) ? 0 : -1,
      -1,
    );
    storeApi.dispatch(removeTaskFromSlice(taskId));
  }

  function handleRow(row: Record<string, unknown>) {
    const state = storeApi.getState();
    const userId = state.userAuth?.id;
    if (!userId || userId !== subscribedUserId) {
      // A callback queued before logout / an account switch must not mutate the
      // new store. Drop it at the producer boundary and tear the channel down.
      unsubscribe();
      return;
    }
    const taskId = idOf(row);
    if (!taskId) return;

    const existing = state.tasks.entities[taskId];
    const visibleProjectIds = new Set(state.projects.ids as string[]);

    if (!inListScope(row, userId, visibleProjectIds)) {
      // Soft-deleted, aged out, reassigned away, or never ours at all (RLS
      // delivers public and shared rows this list does not carry).
      if (existing) evict(taskId);
      return;
    }

    if (!existing) {
      // New to this list. Which organization bucket it belongs to is the RPC's
      // derivation, not the row's — one debounced catch-up read answers it.
      scheduleCatchUp();
      return;
    }

    if (str(row.project_id) !== (existing.project_id ?? null)) {
      // Re-parented: the org bucket AND both projects' counts move. Same read.
      scheduleCatchUp();
      return;
    }

    const wasOpen = !isClosedStatus(existing.status);
    const isOpen = !isClosedStatus(str(row.status));
    adjustCounts(existing.project_id, (isOpen ? 1 : 0) - (wasOpen ? 1 : 0), 0);
    storeApi.dispatch(
      upsertTaskWithLevel({
        record: toTaskRecord(row, existing),
        level: "full-data",
      }),
    );
  }

  function subscribe(userId: string) {
    unsubscribe();
    subscribedUserId = userId;

    stopChannel = subscribeToRealtimeManager(() => ({
      topic: tasksContextChannel.topic({ userId }),
      postgresChanges: [
        {
          // No `created_by` filter: the list carries assigned and project-
          // visible tasks too, and RLS is what authorizes delivery. Scope is
          // decided by `inListScope`, against the RPC's own predicate.
          event: "*",
          schema: "workspace",
          table: "tasks",
          rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
          fingerprint: workspaceRowFingerprint,
          // Own echoes never arrive here — the ledger classified them first,
          // from the writes registered on `tasks/upsertTaskWithLevel`.
          onChange: (delivery) => {
            if (delivery.payload.eventType === "DELETE") {
              // `workspace.tasks` has DEFAULT replica identity, so a DELETE
              // carries the primary key and nothing else — which is all an
              // eviction needs. (It also means Postgres cannot evaluate RLS on
              // the old row, so deletes of tasks we never held arrive too;
              // `evict` no-ops on a row the slice does not have.)
              const id = idOf(delivery.payload.old);
              if (id) evict(id);
              return;
            }
            const row = delivery.row;
            if (row) handleRow(row);
          },
        },
      ],
      // THE CATCH-UP READ. Realtime has no replay, and this fires on reconnect,
      // tab wake, network restore and queue overflow alike.
      onBackfill: () => {
        const state = storeApi.getState();
        if (!state.userAuth?.id || state.userAuth.id !== subscribedUserId) {
          return;
        }
        void storeApi.dispatch(invalidateAndRefetchFullContext());
      },
    }));
  }

  function unsubscribe() {
    subscribedUserId = null;
    if (refetchTimer) {
      clearTimeout(refetchTimer);
      refetchTimer = null;
    }
    if (stopChannel) {
      stopChannel();
      stopChannel = null;
    }
  }

  /**
   * REGISTER OUR OWN WRITES ON THE PACKAGE'S LEDGER — the load-bearing half of
   * echo suppression: `classify` can only recognize the echo of a write it was
   * told about.
   *
   * `tasks/upsertTaskWithLevel` is where every /tasks write path converges
   * AFTER its server round-trip (`createTaskThunk`, `updateTaskThunk`,
   * `toggleTaskCompleteThunk`, the labels/scope/snooze paths — all of them
   * dispatch it with the row the server returned), so the registration happens
   * once, here, rather than being copied into each writer.
   *
   * `tasks/hydrateTasksFromContext` is the catch-up read teaching the ledger
   * the server state we now hold. Those rows are the RPC's thin projection and
   * carry no `description`, so their fingerprint is coarser than a payload's —
   * the monotonic `updated_at` floor is what they are really for, and a
   * fingerprint mismatch can only ever make the package DELIVER an event, never
   * drop one.
   */
  function registerWrite(action: UnknownAction): void {
    const type = action.type;
    if (
      type !== "tasks/upsertTaskWithLevel" &&
      type !== "tasks/hydrateTasksFromContext"
    ) {
      return;
    }
    const ledger = currentRealtimeManager()?.ledger;
    if (!ledger) return;

    const observe = (record: TaskRecord) => {
      ledger.observe({
        table: TASKS_TABLE,
        id: record.id,
        updatedAt: record.updated_at ?? null,
        fingerprint: workspaceRowFingerprint(
          record as unknown as Record<string, unknown>,
        ),
      });
    };

    if (type === "tasks/upsertTaskWithLevel") {
      const record = (action as { payload?: { record?: TaskRecord } }).payload
        ?.record;
      if (record?.id) observe(record);
      return;
    }

    // hydrateTasksFromContext: the whole page in one action.
    for (const id of storeApi.getState().tasks.ids as string[]) {
      const record = storeApi.getState().tasks.entities[id];
      if (record) observe(record);
    }
  }

  return (next) => (action) => {
    // The reducer runs FIRST: for both registered actions the state after the
    // dispatch is exactly what the server has, and that is what the ledger must
    // be told.
    const result = next(action);
    registerWrite(action as UnknownAction);

    if ((action as { type?: string }).type === "hierarchy/fullContextFetchSucceeded") {
      const userId = storeApi.getState().userAuth?.id;
      // Never tear down a healthy channel because a catch-up read finished —
      // only (re)subscribe when it is missing or the user changed.
      if (userId && (subscribedUserId !== userId || !stopChannel)) {
        subscribe(userId);
      }
    }

    if ((action as { type?: string }).type === "userAuth/clearUserAuth") {
      unsubscribe();
    }

    return result;
  };
};
