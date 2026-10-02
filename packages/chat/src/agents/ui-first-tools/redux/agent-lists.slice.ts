/**
 * agentLists slice — live mirror of the cx_agent_lists tables for the active
 * conversation(s). Hydrated on conversation mount via `hydrateAgentLists`;
 * kept in sync via Supabase Realtime Postgres Changes (set up in the
 * `subscribeAgentLists` thunk).
 *
 * Shape:
 *   byConversationId: {
 *     [conversationId]: {
 *       plan: CxAgentPlanRow | null,
 *       tasks: CxAgentTaskRow[],
 *       userTodos: CxUserTodoRow[],
 *       status: 'idle'|'loading'|'ready'|'error',
 *     }
 *   }
 *
 * The aggregate `Agent Lists Hub` view reads across every entry.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  CxAgentPlanRow,
  CxAgentTaskRow,
  CxUserTodoRow,
} from "../tools/types";

export type AgentListsLoadStatus = "idle" | "loading" | "ready" | "error";

export interface AgentListsForConversation {
  plan: CxAgentPlanRow | null;
  tasks: CxAgentTaskRow[];
  userTodos: CxUserTodoRow[];
  status: AgentListsLoadStatus;
  error?: string;
}

export interface AgentListsState {
  byConversationId: Record<string, AgentListsForConversation>;
}

const initialState: AgentListsState = {
  byConversationId: {},
};

function ensureBucket(
  state: AgentListsState,
  conversationId: string,
): AgentListsForConversation {
  if (!state.byConversationId[conversationId]) {
    state.byConversationId[conversationId] = {
      plan: null,
      tasks: [],
      userTodos: [],
      status: "idle",
    };
  }
  return state.byConversationId[conversationId];
}

const slice = createSlice({
  name: "agentLists",
  initialState,
  reducers: {
    setListsLoading(state, action: PayloadAction<string>) {
      ensureBucket(state, action.payload).status = "loading";
    },

    setListsForConversation(
      state,
      action: PayloadAction<{
        conversationId: string;
        plan: CxAgentPlanRow | null;
        tasks: CxAgentTaskRow[];
        userTodos: CxUserTodoRow[];
      }>,
    ) {
      const { conversationId, plan, tasks, userTodos } = action.payload;
      const bucket = ensureBucket(state, conversationId);
      bucket.plan = plan;
      bucket.tasks = tasks;
      bucket.userTodos = userTodos;
      bucket.status = "ready";
      bucket.error = undefined;
    },

    setListsError(
      state,
      action: PayloadAction<{ conversationId: string; error: string }>,
    ) {
      const bucket = ensureBucket(state, action.payload.conversationId);
      bucket.status = "error";
      bucket.error = action.payload.error;
    },

    // ─── Plan mutations ─────────────────────────────────────────────────────

    upsertPlan(state, action: PayloadAction<CxAgentPlanRow>) {
      const bucket = ensureBucket(state, action.payload.conversation_id);
      bucket.plan = action.payload;
    },

    clearPlan(state, action: PayloadAction<string>) {
      const bucket = ensureBucket(state, action.payload);
      bucket.plan = null;
    },

    // ─── Task mutations ─────────────────────────────────────────────────────

    upsertTask(state, action: PayloadAction<CxAgentTaskRow>) {
      const bucket = ensureBucket(state, action.payload.conversation_id);
      const idx = bucket.tasks.findIndex((t) => t.id === action.payload.id);
      if (idx >= 0) bucket.tasks[idx] = action.payload;
      else bucket.tasks.push(action.payload);
      bucket.tasks.sort((a, b) => a.position - b.position);
    },

    setTasks(
      state,
      action: PayloadAction<{
        conversationId: string;
        tasks: CxAgentTaskRow[];
      }>,
    ) {
      ensureBucket(state, action.payload.conversationId).tasks = [
        ...action.payload.tasks,
      ].sort((a, b) => a.position - b.position);
    },

    removeTask(
      state,
      action: PayloadAction<{ conversationId: string; id: string }>,
    ) {
      const bucket = ensureBucket(state, action.payload.conversationId);
      bucket.tasks = bucket.tasks.filter((t) => t.id !== action.payload.id);
    },

    // ─── User-todo mutations ───────────────────────────────────────────────

    upsertUserTodo(state, action: PayloadAction<CxUserTodoRow>) {
      const bucket = ensureBucket(state, action.payload.conversation_id);
      const idx = bucket.userTodos.findIndex((t) => t.id === action.payload.id);
      if (idx >= 0) bucket.userTodos[idx] = action.payload;
      else bucket.userTodos.push(action.payload);
    },

    setUserTodos(
      state,
      action: PayloadAction<{
        conversationId: string;
        userTodos: CxUserTodoRow[];
      }>,
    ) {
      ensureBucket(state, action.payload.conversationId).userTodos = [
        ...action.payload.userTodos,
      ];
    },

    removeUserTodo(
      state,
      action: PayloadAction<{ conversationId: string; id: string }>,
    ) {
      const bucket = ensureBucket(state, action.payload.conversationId);
      bucket.userTodos = bucket.userTodos.filter(
        (t) => t.id !== action.payload.id,
      );
    },

    clearListsForConversation(state, action: PayloadAction<string>) {
      delete state.byConversationId[action.payload];
    },
  },
});

export const {
  setListsLoading,
  setListsForConversation,
  setListsError,
  upsertPlan,
  clearPlan,
  upsertTask,
  setTasks,
  removeTask,
  upsertUserTodo,
  setUserTodos,
  removeUserTodo,
  clearListsForConversation,
} = slice.actions;

export default slice.reducer;
