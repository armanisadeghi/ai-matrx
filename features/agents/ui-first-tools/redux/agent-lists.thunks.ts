/**
 * Hydration and live-mirror thunks for the agentLists slice.
 *
 *   hydrateAgentLists(conversationId)    — initial fetch on conversation mount
 *   subscribeAgentLists(conversationId)  — opens Supabase Realtime channels
 *   unsubscribeAgentLists(conversationId)— tears them down
 *
 * Realtime: ONE channel per conversation carrying three postgres_changes
 * bindings (plan / task / user_todo), all scoped by `conversation_id = ...`.
 *
 * `@ai-matrx/realtime` owns that channel — unique instance topic, echo
 * suppression, dedup, the decoupled ordered handler queue, jittered reconnect,
 * tab sleep, diagnostics. What was here before was a raw
 * `.channel(...).subscribe()` on a STATIC topic (`agent-lists:<id>`, which
 * React 19's double-invoked effects can collide on), three `as any` casts to
 * get past the `.on("postgres_changes")` types, a module-level channel map, and
 * NO catch-up read: an agent that planned and executed a dozen tasks while the
 * tab was asleep left the plan panel permanently showing the pre-sleep state,
 * looking perfectly healthy. `onBackfill` re-hydrates — that is the fix.
 *
 * These are thunks, not components, so the manager arrives through the
 * package's ambient door (`subscribeToRealtimeManager`, realtime 0.6.0) rather
 * than a second manager of our own (which would be a second write ledger).
 */

import type { ThunkAction } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import {
  defineChannelNamespace,
  subscribeToRealtimeManager,
} from "@ai-matrx/realtime";
import { getCurrentPlan } from "../service/agent-plan.service";
import { listTasks } from "../service/agent-task.service";
import { listUserTodos } from "../service/user-todo.service";
import {
  setListsLoading,
  setListsForConversation,
  setListsError,
  upsertPlan,
  upsertTask,
  removeTask,
  upsertUserTodo,
  removeUserTodo,
} from "./agent-lists.slice";
import type {
  CxAgentPlanRow,
  CxAgentTaskRow,
  CxUserTodoRow,
} from "../tools/types";

type AgentListsThunk = ThunkAction<
  Promise<void>,
  RootState,
  unknown,
  UnknownAction
>;

export const hydrateAgentLists =
  (conversationId: string): AgentListsThunk =>
  async (dispatch) => {
    dispatch(setListsLoading(conversationId));
    try {
      const [plan, tasks, userTodos] = await Promise.all([
        getCurrentPlan(conversationId),
        listTasks(conversationId),
        listUserTodos(conversationId),
      ]);
      dispatch(
        setListsForConversation({
          conversationId,
          plan,
          tasks,
          userTodos,
        }),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      dispatch(setListsError({ conversationId, error: msg }));
      // eslint-disable-next-line no-console
      console.error("[agent-lists] hydrate failed", e);
    }
  };

// ── Realtime subscription tracking ──────────────────────────────────────────

/** One place names this channel. A second, different declaration throws. */
const agentListsChannel = defineChannelNamespace({
  namespace: "agent-lists",
  parts: ["conversationId"],
  description:
    "chat.agent_plan + chat.agent_task + chat.user_todo rows for one conversation",
});

/** Per-conversation stop functions — one open channel each. */
const activeChannels = new Map<string, () => void>();

export function subscribeAgentLists(
  conversationId: string,
): ThunkAction<void, RootState, unknown, UnknownAction> {
  return (dispatch) => {
    if (activeChannels.has(conversationId)) return;

    const scoped = `conversation_id=eq.${conversationId}`;
    const rowId = (row: Record<string, unknown>): string | undefined =>
      typeof row.id === "string" ? row.id : undefined;

    const stop = subscribeToRealtimeManager(() => ({
      topic: agentListsChannel.topic({ conversationId }),
      postgresChanges: [
        {
          event: "*",
          schema: "chat",
          table: "agent_plan",
          filter: scoped,
          rowId,
          fingerprint: (row) => JSON.stringify(row.steps ?? row.updated_at ?? null),
          onChange: ({ payload, row }) => {
            if (payload.eventType === "DELETE") {
              // Plan deleted — re-hydrate (cheaper than tracking which plan id
              // was the current one for handling supersession).
              void dispatch(hydrateAgentLists(conversationId));
            } else if (row) {
              dispatch(upsertPlan(row as unknown as CxAgentPlanRow));
            }
          },
        },
        {
          event: "*",
          schema: "chat",
          table: "agent_task",
          filter: scoped,
          rowId,
          fingerprint: (row) => JSON.stringify([row.status ?? null, row.title ?? null]),
          onChange: ({ payload, row }) => {
            if (payload.eventType === "DELETE") {
              const old = payload.old as Partial<CxAgentTaskRow> | undefined;
              if (old?.id) {
                dispatch(removeTask({ conversationId, id: old.id }));
              }
            } else if (row) {
              dispatch(upsertTask(row as unknown as CxAgentTaskRow));
            }
          },
        },
        {
          event: "*",
          schema: "chat",
          table: "user_todo",
          filter: scoped,
          rowId,
          fingerprint: (row) => JSON.stringify([row.status ?? null, row.title ?? null]),
          onChange: ({ payload, row }) => {
            if (payload.eventType === "DELETE") {
              const old = payload.old as Partial<CxUserTodoRow> | undefined;
              if (old?.id) {
                dispatch(removeUserTodo({ conversationId, id: old.id }));
              }
            } else if (row) {
              dispatch(upsertUserTodo(row as unknown as CxUserTodoRow));
            }
          },
        },
      ],
      // Realtime has no replay: everything the agent did while the socket was
      // down is gone. Re-hydrate the whole conversation's lists on every
      // recovery path (reconnect, tab wake, network restore, queue overflow).
      onBackfill: () => {
        void dispatch(hydrateAgentLists(conversationId));
      },
    }));

    activeChannels.set(conversationId, stop);
  };
}

export function unsubscribeAgentLists(
  conversationId: string,
): ThunkAction<void, RootState, unknown, UnknownAction> {
  return () => {
    const stop = activeChannels.get(conversationId);
    if (!stop) return;
    stop();
    activeChannels.delete(conversationId);
  };
}
