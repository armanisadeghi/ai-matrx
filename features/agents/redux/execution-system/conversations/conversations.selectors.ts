import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { ExecutionInstance } from "@/features/agents/types/instance.types";
import type { ConversationRecord } from "./conversations.slice";

const EMPTY_INSTANCES: ConversationRecord[] = [];
const EMPTY_CONVERSATION_IDS_BY_AGENT: Record<string, string[]> = {};

export const selectInstance =
  (conversationId: string) =>
  (state: RootState): ConversationRecord | undefined =>
    state.conversations.byConversationId[conversationId];

export const selectAllConversationIds = (state: RootState): string[] =>
  state.conversations.allConversationIds;

/** @deprecated Use selectAllConversationIds */
export const selectAllInstanceIds = selectAllConversationIds;

/** Conversation IDs grouped by agent ID; stable empty object when none. */
export const selectConversationIdsByAgent = createSelector(
  (state: RootState) => state.conversations.allConversationIds,
  (state: RootState) => state.conversations.byConversationId,
  (allIds, byId): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    for (const cid of allIds) {
      const inst = byId[cid];
      if (!inst) continue;
      const aid = inst.agentId;
      if (!map[aid]) map[aid] = [];
      map[aid].push(cid);
    }
    return Object.keys(map).length === 0
      ? EMPTY_CONVERSATION_IDS_BY_AGENT
      : map;
  },
);

export const selectInstancesByAgent = (agentId: string) =>
  createSelector(
    (state: RootState) => state.conversations.allConversationIds,
    (state: RootState) => state.conversations.byConversationId,
    (allIds, byId): ConversationRecord[] => {
      const result = allIds
        .map((id) => byId[id])
        .filter((inst): inst is ExecutionInstance => inst?.agentId === agentId);
      return result.length === 0 ? EMPTY_INSTANCES : result;
    },
  );

export const selectInstanceStatus =
  (conversationId: string) => (state: RootState) =>
    state.conversations.byConversationId[conversationId]?.status;

export const selectRunningInstances = createSelector(
  (state: RootState) => state.conversations.allConversationIds,
  (state: RootState) => state.conversations.byConversationId,
  (allIds, byId): ConversationRecord[] => {
    const result = allIds
      .map((id) => byId[id])
      .filter(
        (inst): inst is ExecutionInstance =>
          inst != null &&
          (inst.status === "running" || inst.status === "streaming"),
      );
    return result.length === 0 ? EMPTY_INSTANCES : result;
  },
);

export const selectAgentIdFromInstance =
  (conversationId: string) =>
  (state: RootState): string | undefined =>
    state.conversations.byConversationId[conversationId]?.agentId;

export const selectIsCacheOnly =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.conversations.byConversationId[conversationId]?.cacheOnly ?? true;

// ---------------------------------------------------------------------------
// Sidebar / metadata selectors — read the fields added in Phase 1.2
// ---------------------------------------------------------------------------

export const selectConversationTitle =
  (conversationId: string) =>
  (state: RootState): string | null =>
    state.conversations.byConversationId[conversationId]?.title ?? null;

export const selectConversationDescription =
  (conversationId: string) =>
  (state: RootState): string | null =>
    state.conversations.byConversationId[conversationId]?.description ?? null;

export const selectConversationKeywords =
  (conversationId: string) =>
  (state: RootState): string[] | null =>
    state.conversations.byConversationId[conversationId]?.keywords ?? null;

export const selectConversationIsEphemeral =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.conversations.byConversationId[conversationId]?.isEphemeral ?? false;

export const selectApiEndpointMode =
  (conversationId: string) => (state: RootState) =>
    state.conversations.byConversationId[conversationId]?.apiEndpointMode ??
    null;

export const selectConversationSurfaceKey =
  (conversationId: string) =>
  (state: RootState): string | null =>
    state.conversations.byConversationId[conversationId]?.surfaceKey ?? null;

/**
 * Per-conversation sandbox override — `{ rowId, proxyUrl }` when this
 * conversation is pinned to a specific box (power-user path), else `null`.
 * The agent-sandbox resolver reads this first, falling back to the user's
 * shared `activeAgentSandbox` preference.
 */
export const selectConversationSandboxOverride =
  (conversationId: string) =>
  (state: RootState): { rowId: string; proxyUrl: string } | null =>
    state.conversations.byConversationId[conversationId]?.sandboxOverride ??
    null;

export const selectConversationScopeIds = (conversationId: string) =>
  createSelector(
    (state: RootState) => state.conversations.byConversationId[conversationId],
    (record) => ({
      organizationId: record?.organizationId ?? null,
      projectId: record?.projectId ?? null,
      taskId: record?.taskId ?? null,
    }),
  );
