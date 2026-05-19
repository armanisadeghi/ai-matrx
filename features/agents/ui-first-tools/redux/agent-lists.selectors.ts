/**
 * Selectors for the agentLists slice.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  CxAgentPlanRow,
  CxAgentTaskRow,
  CxUserTodoRow,
} from "../tools/types";
import type { AgentListsForConversation } from "./agent-lists.slice";

const EMPTY_TASKS: CxAgentTaskRow[] = [];
const EMPTY_TODOS: CxUserTodoRow[] = [];

const DEFAULT_BUCKET: AgentListsForConversation = {
  plan: null,
  tasks: EMPTY_TASKS,
  userTodos: EMPTY_TODOS,
  status: "idle",
};

export const selectAgentListsBucket =
  (conversationId: string) =>
  (state: RootState): AgentListsForConversation =>
    state.agentLists?.byConversationId[conversationId] ?? DEFAULT_BUCKET;

export const selectAgentPlan =
  (conversationId: string) =>
  (state: RootState): CxAgentPlanRow | null =>
    state.agentLists?.byConversationId[conversationId]?.plan ?? null;

export const selectAgentTasks =
  (conversationId: string) =>
  (state: RootState): CxAgentTaskRow[] =>
    state.agentLists?.byConversationId[conversationId]?.tasks ?? EMPTY_TASKS;

export const selectUserTodosForConversation =
  (conversationId: string) =>
  (state: RootState): CxUserTodoRow[] =>
    state.agentLists?.byConversationId[conversationId]?.userTodos ??
    EMPTY_TODOS;

export const selectAgentTaskCounts = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.agentLists?.byConversationId[conversationId]?.tasks ?? EMPTY_TASKS,
    (tasks) => {
      let done = 0;
      let inProgress = 0;
      for (const t of tasks) {
        if (t.status === "done") done++;
        else if (t.status === "in_progress") inProgress++;
      }
      return {
        total: tasks.length,
        done,
        inProgress,
        pending: tasks.length - done - inProgress,
      };
    },
  );

export const selectUserTodoCounts = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.agentLists?.byConversationId[conversationId]?.userTodos ??
      EMPTY_TODOS,
    (todos) => {
      let done = 0;
      for (const t of todos) if (t.done) done++;
      return { total: todos.length, done, open: todos.length - done };
    },
  );

/**
 * Aggregate selector for the ListsHubView. Returns one entry per conversation
 * that has any plan/task/user-todo data. Reads only the slice — no DB hit.
 */
const EMPTY_BY_CONVERSATION: Record<string, AgentListsForConversation> = {};

export const selectAllConversationLists = (state: RootState) =>
  state.agentLists?.byConversationId ?? EMPTY_BY_CONVERSATION;

/**
 * Has-anything check for the chip — only show the chip when there's
 * something to display.
 */
export const selectHasAgentListsContent =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const bucket = state.agentLists?.byConversationId[conversationId];
    if (!bucket) return false;
    return (
      bucket.plan !== null ||
      bucket.tasks.length > 0 ||
      bucket.userTodos.length > 0
    );
  };
