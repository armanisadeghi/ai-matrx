/**
 * Thunks for the scoped conversation-history slice.
 *
 * Fetches read directly from `cx_conversation` — the table is RLS-filtered
 * to the signed-in user, so no explicit user scoping is needed here. We
 * pass `.in("initial_agent_id", agentIds)` to get a real multi-agent list
 * in a single Supabase round-trip (the per-agent RPC does not support this).
 *
 * If the scope has `agentIds: []` we fetch across all of the user's agents.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import type { AppThunk, RootState } from "@/lib/redux/store";
import { setScopePageSuccess, setScopeStatus, configureScope } from "./slice";
import { CONVERSATION_HISTORY_TTL_MS, defaultScopeState } from "./types";

export interface FetchConversationHistoryArgs {
  scopeId: string;
  /** Overrides the scope's stored agentIds for this fetch. */
  agentIds?: string[];
  /** Overrides the scope's stored pageSize for this fetch. */
  pageSize?: number;
  /**
   * When true (default), replaces existing items with the freshly-fetched
   * first page. When false, appends a new page using the scope's `offset`.
   */
  replace?: boolean;
}

export interface FetchConversationHistoryResult {
  scopeId: string;
  items: ConversationListItem[];
  hasMore: boolean;
  nextOffset: number;
  replace: boolean;
}

/** Columns we project from `cx_conversation` — enough for sidebar rendering. */
const HISTORY_COLUMNS =
  "id, title, description, status, message_count, initial_agent_id, last_model_id, source_app, source_feature, created_at, updated_at, is_favorite";

/**
 * Fetches a page of conversations for `scopeId`. If the scope doesn't yet
 * exist, it's registered with default settings first.
 *
 * Usage:
 * - Initial load:        `dispatch(fetchConversationHistory({ scopeId, agentIds, replace: true }))`
 * - "Load more":         `dispatch(fetchConversationHistory({ scopeId, replace: false }))`
 * - Background refresh:  `dispatch(ensureConversationHistoryFresh(scopeId))`
 */
export const fetchConversationHistory = createAsyncThunk<
  FetchConversationHistoryResult,
  FetchConversationHistoryArgs,
  { state: RootState; rejectValue: string }
>(
  "conversationHistory/fetchPage",
  async (args, { dispatch, getState, rejectWithValue }) => {
    const replace = args.replace ?? true;
    const state = getState();
    const existing = state.conversationHistory.scopes[args.scopeId];

    // Seed the scope with whatever the caller supplied + the existing state.
    if (
      !existing ||
      args.agentIds !== undefined ||
      args.pageSize !== undefined
    ) {
      dispatch(
        configureScope({
          scopeId: args.scopeId,
          agentIds: args.agentIds ?? existing?.agentIds ?? [],
          pageSize:
            args.pageSize ?? existing?.pageSize ?? defaultScopeState.pageSize,
        }),
      );
    }

    const scope =
      getState().conversationHistory.scopes[args.scopeId] ?? defaultScopeState;
    const pageSize = args.pageSize ?? scope.pageSize;
    const offset = replace ? 0 : scope.offset;
    const agentIds = args.agentIds ?? scope.agentIds;

    dispatch(
      setScopeStatus({
        scopeId: args.scopeId,
        status: replace ? "loading" : "loading-more",
        error: null,
      }),
    );

    let query = supabase
      .from("cx_conversation")
      .select(HISTORY_COLUMNS)
      .is("deleted_at", null)
      .eq("is_ephemeral", false)
      .order("updated_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (agentIds.length > 0) {
      query = query.in("initial_agent_id", agentIds);
    }

    const { data, error } = await query;
    if (error) {
      dispatch(
        setScopeStatus({
          scopeId: args.scopeId,
          status: "failed",
          error: error.message,
        }),
      );
      return rejectWithValue(error.message);
    }

    const rows = data ?? [];
    const items: ConversationListItem[] = rows.map((row) => ({
      conversationId: row.id as string,
      title: (row.title ?? null) as string | null,
      description: (row.description ?? null) as string | null,
      updatedAt: row.updated_at as string,
      createdAt: row.created_at as string,
      status: row.status as string,
      messageCount: (row.message_count ?? 0) as number,
      isFavorite: (row.is_favorite ?? false) as boolean,
      agentId: (row.initial_agent_id ?? null) as string | null,
      lastModelId: (row.last_model_id ?? null) as string | null,
      sourceApp: (row.source_app ?? undefined) as string | undefined,
      sourceFeature: (row.source_feature ?? undefined) as string | undefined,
    }));

    const hasMore = items.length === pageSize;
    const nextOffset = offset + items.length;

    dispatch(
      setScopePageSuccess({
        scopeId: args.scopeId,
        items,
        hasMore,
        replace,
        nextOffset,
      }),
    );

    return {
      scopeId: args.scopeId,
      items,
      hasMore,
      nextOffset,
      replace,
    };
  },
);

/**
 * Refetch the first page if stale or empty; no-op otherwise. Useful from a
 * mount effect without manually tracking freshness.
 */
export function ensureConversationHistoryFresh(
  scopeId: string,
): AppThunk<void> {
  return (dispatch, getState) => {
    const scope = getState().conversationHistory.scopes[scopeId];
    if (!scope) {
      void dispatch(fetchConversationHistory({ scopeId, replace: true }));
      return;
    }
    const stale =
      scope.lastFetchedAt === null ||
      Date.now() - scope.lastFetchedAt > CONVERSATION_HISTORY_TTL_MS;
    if (scope.status === "loading" || scope.status === "loading-more") return;
    if (stale || scope.items.length === 0) {
      void dispatch(fetchConversationHistory({ scopeId, replace: true }));
    }
  };
}
