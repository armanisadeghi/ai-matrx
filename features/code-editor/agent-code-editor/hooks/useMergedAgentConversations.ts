"use client";

/**
 * useMergedAgentConversations
 *
 * For a fixed set of agent ids, fetches each agent's conversation list (once,
 * if not already loading/loaded) and returns a single merged, newest-first
 * list. The list also includes LOCAL DRAFTS — conversations that exist in the
 * `conversations` slice but haven't been committed to the server yet
 * (messageCount == 0). Drafts are labelled "Draft <agent name> (N)" where N
 * is the per-agent draft index.
 *
 * Drafts live in Redux for the lifetime of the session, so closing the
 * editor panel and reopening it preserves them — including whatever the user
 * had typed into the input.
 *
 * Implementation note: uses `createSelector` built per-hook-instance with
 * `useMemo`, so the merge only runs when the slice inputs actually change.
 * The hook does NOT subscribe to the full RootState.
 */

import { selectAllAgents } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { useEffect, useMemo } from "react";
import { createSelector } from "@reduxjs/toolkit";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { fetchAgentConversations } from "@ai-matrx/chat/agents/redux/conversation-list/conversation-list.thunks";
import { conversationListCacheKey } from "@ai-matrx/chat/agents/redux/conversation-list/conversation-list.types";
import type {
  ConversationListItem,
  ConversationListLoadStatus,
} from "@ai-matrx/chat/agents/redux/conversation-list/conversation-list.types";

// Stable empty references so selectors returning "nothing" don't churn.
const EMPTY_IDS: string[] = [];

export interface MergedConversationRow {
  conversationId: string;
  agentId: string;
  agentName: string;
  /** Display title. For drafts: "Draft <agentName> (N)". */
  title: string;
  /** Message count — 0 for drafts. */
  messageCount: number;
  /** Sort timestamp. Fetched rows: `updatedAt`. Drafts: `createdAt` from instance. */
  sortKey: string;
  /** True when this row is a local draft (no server conversation yet). */
  isDraft: boolean;
  /** For fetched rows, the underlying list item. */
  item?: ConversationListItem;
}

export interface UseMergedAgentConversationsReturn {
  rows: MergedConversationRow[];
  /** Aggregate status — loading if any agent is loading, idle if any idle, else succeeded/failed. */
  status: ConversationListLoadStatus;
  errorMessages: string[];
}

/**
 * Build the merged-selector for a specific list of agentIds. Rebuilt when
 * the agentIds signature changes — callers wrap in useMemo.
 */
function buildMergedSelector(agentIds: readonly string[]) {
  return createSelector(
    [
      (state: RootState) => state.conversationList.agentCaches,
      (state: RootState) => state.conversationList.byConversationId,
      (state: RootState) => state.conversations.byConversationId,
      (state: RootState) => state.conversations.allConversationIds,
      (state: RootState) => state.messages.byConversationId,
      (state: RootState) => selectAllAgents(state),
    ],
    (
      agentCaches,
      convListById,
      instancesById,
      instanceIds,
      messagesById,
      agentDefs,
    ): UseMergedAgentConversationsReturn => {
      const rows: MergedConversationRow[] = [];
      const statuses: ConversationListLoadStatus[] = [];
      const errors: string[] = [];

      for (const agentId of agentIds) {
        const cacheKey = conversationListCacheKey(agentId, null);
        const entry = agentCaches[cacheKey];
        const status: ConversationListLoadStatus = entry?.status ?? "idle";
        statuses.push(status);
        if (entry?.error) errors.push(entry.error);

        const agentDef = agentDefs?.[agentId];
        const agentName =
          agentDef?.name?.trim() && agentDef.name.length > 0
            ? agentDef.name
            : `Agent ${agentId.slice(0, 6)}`;

        // 1. Fetched items for this agent
        const fetchedIds = new Set<string>();
        const convIds = entry?.conversationIds ?? EMPTY_IDS;
        for (const cid of convIds) {
          const item = convListById[cid];
          if (!item) continue;
          fetchedIds.add(cid);
          rows.push({
            conversationId: cid,
            agentId,
            agentName,
            title:
              item.title && item.title.trim().length > 0
                ? item.title
                : "Untitled",
            messageCount: item.messageCount,
            sortKey: item.updatedAt,
            isDraft: false,
            item,
          });
        }

        // 2. Drafts — local instances for this agent with zero messages, not
        //    already in the fetched list.
        const drafts: MergedConversationRow[] = [];
        let draftIndex = 0;
        for (const cid of instanceIds) {
          const inst = instancesById[cid];
          if (!inst || inst.agentId !== agentId) continue;
          if (fetchedIds.has(cid)) continue;
          const msgEntry = messagesById[cid];
          const msgCount = msgEntry?.orderedIds?.length ?? 0;
          if (msgCount > 0) continue; // has messages → not a draft

          draftIndex++;
          drafts.push({
            conversationId: cid,
            agentId,
            agentName,
            title: `Draft ${agentName} (${draftIndex})`,
            messageCount: 0,
            sortKey: inst.createdAt,
            isDraft: true,
          });
        }
        // Drafts newest-first within the agent (highest index first).
        drafts.reverse();
        rows.push(...drafts);
      }

      // Global sort: newest sortKey first.
      rows.sort((a, b) =>
        a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0,
      );

      // Aggregate status.
      let aggStatus: ConversationListLoadStatus = "succeeded";
      if (statuses.includes("loading")) aggStatus = "loading";
      else if (statuses.includes("idle")) aggStatus = "idle";
      else if (statuses.length > 0 && statuses.every((s) => s === "failed"))
        aggStatus = "failed";

      return { rows, status: aggStatus, errorMessages: errors };
    },
  );
}

/**
 * Hook form — feed a stable list of `agentIds` and it fetches + merges.
 */
export function useMergedAgentConversations(
  agentIds: readonly string[],
): UseMergedAgentConversationsReturn {
  const dispatch = useAppDispatch();

  // Stable signature for deps.
  const signature = agentIds.join("|");

  // One selector per unique agent-list signature.
  const selector = useMemo(
    () => buildMergedSelector(agentIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );

  const result = useAppSelector(selector);

  // Trigger fetches for any agent whose cache is still idle.
  useEffect(() => {
    for (const agentId of agentIds) {
      // We deliberately read status through a one-shot snapshot check rather
      // than subscribing, because the fetch thunk is idempotent (early-returns
      // on cache-hit / in-flight).
      dispatch(fetchAgentConversations({ agentId, versionFilter: null }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, dispatch]);

  return result;
}
