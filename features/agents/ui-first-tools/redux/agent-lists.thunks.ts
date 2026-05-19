/**
 * Hydration and live-mirror thunks for the agentLists slice.
 *
 *   hydrateAgentLists(conversationId)    — initial fetch on conversation mount
 *   subscribeAgentLists(conversationId)  — opens Supabase Realtime channels
 *   unsubscribeAgentLists(conversationId)— tears them down
 *
 * Realtime: one channel per (conversationId, table) is overkill — Supabase
 * recommends one channel per page that filters per-table. We collapse to one
 * channel `agent-lists:<conversationId>` with multiple postgres_changes
 * subscriptions, one per table, all scoped by `conversation_id = ...`.
 */

import type { ThunkAction } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { supabase } from "@/utils/supabase/client";
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

const activeChannels = new Map<string, ReturnType<typeof supabase.channel>>();

export function subscribeAgentLists(
  conversationId: string,
): ThunkAction<void, RootState, unknown, UnknownAction> {
  return (dispatch) => {
    if (activeChannels.has(conversationId)) return;

    const channel = supabase
      .channel(`agent-lists:${conversationId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "cx_agent_plan",
          filter: `conversation_id=eq.${conversationId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (payload.eventType === "DELETE") {
            // Plan deleted — re-hydrate (cheaper than tracking which plan id
            // was the current one for handling supersession).
            void dispatch(hydrateAgentLists(conversationId));
          } else if (payload.new) {
            dispatch(upsertPlan(payload.new as CxAgentPlanRow));
          }
        },
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "cx_agent_task",
          filter: `conversation_id=eq.${conversationId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (payload.eventType === "DELETE") {
            dispatch(
              removeTask({
                conversationId,
                id: (payload.old as CxAgentTaskRow).id,
              }),
            );
          } else if (payload.new) {
            dispatch(upsertTask(payload.new as CxAgentTaskRow));
          }
        },
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "cx_user_todo",
          filter: `conversation_id=eq.${conversationId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (payload.eventType === "DELETE") {
            dispatch(
              removeUserTodo({
                conversationId,
                id: (payload.old as CxUserTodoRow).id,
              }),
            );
          } else if (payload.new) {
            dispatch(upsertUserTodo(payload.new as CxUserTodoRow));
          }
        },
      )
      .subscribe();

    activeChannels.set(conversationId, channel);
  };
}

export function unsubscribeAgentLists(
  conversationId: string,
): ThunkAction<void, RootState, unknown, UnknownAction> {
  return () => {
    const channel = activeChannels.get(conversationId);
    if (!channel) return;
    void supabase.removeChannel(channel);
    activeChannels.delete(conversationId);
  };
}
