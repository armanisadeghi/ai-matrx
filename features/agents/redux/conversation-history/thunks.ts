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
import { applyFavoritesFromUes } from "@/features/agents/redux/conversation-list/conversation-list.thunks";
import type { AppThunk, RootState } from "@/lib/redux/store";
import {
  setScopePageSuccess,
  setScopeStatus,
  configureScope,
  setSourceFacets,
  setSourceFacetsStatus,
} from "./slice";
import {
  CONVERSATION_HISTORY_TTL_MS,
  SOURCE_FACETS_TTL_MS,
  defaultScopeState,
  type SourceFacet,
} from "./types";

export interface FetchConversationHistoryArgs {
  scopeId: string;
  /** Overrides the scope's stored agentIds for this fetch. */
  agentIds?: string[];
  /**
   * Overrides the scope's stored `excludeSourceFeatures`. Conversations with
   * `cx_conversation.source_feature` in this list are hidden from the result.
   * `/chat` uses `['voice-agent']` so voice transcripts don't pollute the
   * text-chat history.
   */
  excludeSourceFeatures?: string[];
  /**
   * Overrides the scope's stored `includeSourceFeatures` ALLOW-list. When
   * non-empty, only rows whose `source_feature` is in this set are shown
   * (OR-combined with `includeSourceApps` / `includeEmptySource`).
   */
  includeSourceFeatures?: string[];
  /** Overrides the scope's stored `includeSourceApps` ALLOW-list. */
  includeSourceApps?: string[];
  /** Overrides the scope's stored `includeEmptySource` flag. */
  includeEmptySource?: boolean;
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

/** Columns we project from `cx_conversation` — enough for sidebar rendering.
 * `is_favorite` is intentionally absent: favorite state is canonical in
 * `platform.user_entity_state` (overlaid via `applyFavoritesFromUes`), and the
 * column is being retired. */
const HISTORY_COLUMNS =
  "id, title, description, status, message_count, initial_agent_id, last_model_id, source_app, source_feature, created_at, updated_at, exclude_from_kg";

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
      args.excludeSourceFeatures !== undefined ||
      args.includeSourceFeatures !== undefined ||
      args.includeSourceApps !== undefined ||
      args.includeEmptySource !== undefined ||
      args.pageSize !== undefined
    ) {
      dispatch(
        configureScope({
          scopeId: args.scopeId,
          agentIds: args.agentIds ?? existing?.agentIds ?? [],
          excludeSourceFeatures:
            args.excludeSourceFeatures ??
            existing?.excludeSourceFeatures ??
            [],
          includeSourceFeatures:
            args.includeSourceFeatures ??
            existing?.includeSourceFeatures ??
            [],
          includeSourceApps:
            args.includeSourceApps ?? existing?.includeSourceApps ?? [],
          includeEmptySource:
            args.includeEmptySource ?? existing?.includeEmptySource ?? false,
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
    const excludeSourceFeatures =
      args.excludeSourceFeatures ?? scope.excludeSourceFeatures;
    const includeSourceFeatures =
      args.includeSourceFeatures ?? scope.includeSourceFeatures;
    const includeSourceApps =
      args.includeSourceApps ?? scope.includeSourceApps;
    const includeEmptySource =
      args.includeEmptySource ?? scope.includeEmptySource;

    dispatch(
      setScopeStatus({
        scopeId: args.scopeId,
        status: replace ? "loading" : "loading-more",
        error: null,
      }),
    );

    let query = supabase
      .schema("chat").from("conversation")
      .select(HISTORY_COLUMNS)
      .is("deleted_at", null)
      .eq("is_ephemeral", false)
      .order("updated_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (agentIds.length > 0) {
      query = query.in("initial_agent_id", agentIds);
    }

    // Per-scope blacklist on `source_feature`. Each value gets its own `.neq`
    // — Supabase chains them with AND, which is what we want. Used by `/chat`
    // to drop voice-agent rows from the text-chat history.
    for (const sf of excludeSourceFeatures) {
      query = query.neq("source_feature", sf);
    }

    // Per-scope ALLOW-list on source provenance. OR-combined so a row shows
    // if its `source_feature` is selected, OR its `source_app` is selected,
    // OR it's an empty/null-source row and those are opted-in. An entirely
    // empty allow-list means "no source filter" (show everything) — that's
    // how the cross-agent browse window behaves. The OR group ANDs with the
    // agent / exclude / soft-delete filters above.
    const orParts: string[] = [];
    if (includeSourceFeatures.length > 0) {
      orParts.push(`source_feature.in.(${includeSourceFeatures.join(",")})`);
    }
    if (includeSourceApps.length > 0) {
      orParts.push(`source_app.in.(${includeSourceApps.join(",")})`);
    }
    if (includeEmptySource) {
      // Generic rows store '' (column default) or NULL — match both.
      orParts.push("source_feature.is.null");
      orParts.push('source_feature.eq.""');
    }
    if (orParts.length > 0) {
      query = query.or(orParts.join(","));
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
    // Favorite state is canonical in `platform.user_entity_state`, not the
    // (soon-to-be-dropped) `cx_conversation.is_favorite` column — default false
    // here, then overlay the real flag via `applyFavoritesFromUes`.
    const mapped: ConversationListItem[] = rows.map((row) => ({
      conversationId: row.id as string,
      title: (row.title ?? null) as string | null,
      description: (row.description ?? null) as string | null,
      updatedAt: row.updated_at as string,
      createdAt: row.created_at as string,
      status: row.status as string,
      messageCount: (row.message_count ?? 0) as number,
      isFavorite: false,
      excludeFromKg: (row.exclude_from_kg ?? false) as boolean,
      agentId: (row.initial_agent_id ?? null) as string | null,
      lastModelId: (row.last_model_id ?? null) as string | null,
      sourceApp: (row.source_app ?? undefined) as string | undefined,
      sourceFeature: (row.source_feature ?? undefined) as string | undefined,
    }));
    const items = await applyFavoritesFromUes(mapped);

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
  {
    // In-flight dedup: if a fetch for this scope is already running, don't fire
    // a second parallel Supabase read. Guards against the same scopeId being
    // dispatched twice before the first resolves (effect dep churn, rapid
    // mount/remount). `loadMore` is naturally serialized — it dispatches from a
    // click after the previous page settled — so blocking while "loading-more"
    // is safe too. (Distinct scopeIds are independent and not deduped here.)
    condition: (args, { getState }) => {
      const scope = getState().conversationHistory.scopes[args.scopeId];
      if (scope?.status === "loading" || scope?.status === "loading-more") {
        return false;
      }
      return true;
    },
  },
);

/**
 * Loads the user-wide source facets — distinct (source_app, source_feature)
 * pairings with counts — used to populate the filter tree. Cached on the
 * slice root with a 5-minute TTL; pass `{ force: true }` to bypass it.
 *
 * Backed by the `get_cx_conversation_source_facets` RPC, which is RLS-scoped
 * to the caller and excludes ephemeral / soft-deleted rows server-side.
 */
export const fetchSourceFacets = createAsyncThunk<
  SourceFacet[],
  { force?: boolean } | undefined,
  { state: RootState; rejectValue: string }
>(
  "conversationHistory/fetchSourceFacets",
  async (args, { dispatch, getState, rejectWithValue }) => {
    const { sourceFacets, sourceFacetsStatus, sourceFacetsLastFetchedAt } =
      getState().conversationHistory;
    const force = args?.force ?? false;
    const fresh =
      sourceFacetsLastFetchedAt !== null &&
      Date.now() - sourceFacetsLastFetchedAt < SOURCE_FACETS_TTL_MS;
    if (!force && (sourceFacetsStatus === "loading" || fresh)) {
      return sourceFacets;
    }

    dispatch(setSourceFacetsStatus({ status: "loading", error: null }));

    const { data, error } = await supabase.rpc(
      "get_cx_conversation_source_facets",
    );
    if (error) {
      dispatch(
        setSourceFacetsStatus({ status: "failed", error: error.message }),
      );
      return rejectWithValue(error.message);
    }

    const rows = (data ?? []) as Array<{
      source_app: string | null;
      source_feature: string | null;
      n: number | string;
    }>;
    const facets: SourceFacet[] = rows.map((row) => ({
      sourceApp: row.source_app ?? null,
      sourceFeature: row.source_feature ?? null,
      count: typeof row.n === "string" ? Number(row.n) || 0 : (row.n ?? 0),
    }));
    dispatch(setSourceFacets({ facets }));
    return facets;
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
