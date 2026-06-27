/**
 * conversation-list thunks.
 *
 * Port of the legacy `agent-conversations` RPC thunks onto the unified
 * `conversationList` slice. The RPC surface is unchanged (`get_agent_conversations`);
 * the normalization pipeline now writes into the shared entity store +
 * per-agent cache references.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";
import type { AppThunk, RootState } from "@/lib/redux/store";
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { ConversationListItem } from "./conversation-list.types";
import { conversationListCacheKey } from "./conversation-list.types";
import { selectAgentIdFromInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import {
  setAgentCacheLoading,
  setAgentCacheSuccess,
  setAgentCacheError,
  setGlobalListLoading,
  setGlobalListSuccess,
  setGlobalListError,
} from "./conversation-list.slice";
import { CONVERSATION_LIST_PAGE_SIZE } from "./conversation-list.types";

type GetAgentConversationsReturns =
  Database["public"]["Functions"]["get_agent_conversations"]["Returns"];
type RpcRow = GetAgentConversationsReturns[number];

// ── Input shapes (legacy parity) ─────────────────────────────────────────────

export interface FetchAgentConversationsNormalizedArgs {
  agentId: string;
  versionFilter: number | null;
}

export type FetchAgentConversationsArgInput =
  | { agentId: string; versionFilter?: number | null; instanceId?: never }
  | { instanceId: string; versionFilter?: number | null; agentId?: never };

/** @deprecated Use FetchAgentConversationsArgInput. */
export type FetchAgentConversationsArgs = FetchAgentConversationsArgInput;

export interface FetchAgentConversationsResult {
  cacheKey: string;
  request: { agentId: string; versionFilter: number | null };
  conversations: ConversationListItem[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function resolveCanonicalAgentIdForConversationsFetch(
  input: FetchAgentConversationsArgInput,
  state: RootState,
): { canonicalAgentId: string; versionFilter: number | null } | null {
  const versionFilter =
    input.versionFilter === undefined ? null : input.versionFilter;

  let mapKey: string | undefined;
  if ("agentId" in input && input.agentId) {
    mapKey = input.agentId;
  } else if ("instanceId" in input && input.instanceId) {
    mapKey = selectAgentIdFromInstance(input.instanceId)(state);
  }

  if (!mapKey) return null;

  const agent = state.agentDefinition.agents?.[mapKey];
  const canonicalAgentId = agent?.parentAgentId ?? agent?.id ?? mapKey;

  return { canonicalAgentId, versionFilter };
}

export function mapRpcRowToConversationListItem(
  row: RpcRow,
): ConversationListItem {
  return {
    conversationId: row.conversation_id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    messageCount: row.message_count,
    // Favorite state is canonical in `platform.user_entity_state`, NOT the
    // soon-to-be-dropped `cx_conversation.is_favorite` column. Default false
    // here; `applyFavoritesFromUes` overlays the real value after load.
    isFavorite: false,
    // Agent-scoped RPC does NOT project `exclude_from_kg` yet — default
    // false; the menu toggle writes through, and the next direct read
    // (sidebar / history scope) reconciles to the true value.
    excludeFromKg: false,
    agentVersionNumber: row.agent_version_number,
    initialAgentVersionId: row.initial_agent_version_id,
    lastModelId: row.last_model_id,
    sourceApp: row.source_app,
    sourceFeature: row.source_feature,
  };
}

/** @deprecated Kept under the legacy name for grep-compatibility. */
export const mapRpcRowToAgentConversationListItem =
  mapRpcRowToConversationListItem;

/**
 * Overlay canonical favorite state from `platform.user_entity_state` onto a
 * freshly-loaded list of conversation rows. The DB column is being retired, so
 * the list/RPC reads no longer carry a trustworthy `isFavorite`; this bulk read
 * (one `ues_get_bulk` round-trip) sources it from the system of record.
 *
 * Returns a NEW array with each item's `isFavorite` set true iff its
 * user_entity_state row has the favorite flag. On RPC failure it logs loudly
 * and returns the input unchanged (favorites simply render unset rather than
 * blocking the list).
 */
export async function applyFavoritesFromUes(
  items: ConversationListItem[],
): Promise<ConversationListItem[]> {
  if (items.length === 0) return items;
  const ids = items.map((i) => i.conversationId);
  const result = await favoritesService.getBulk("conversation", ids);
  if (isScopesRpcErr(result)) {
    console.error(
      "[conversationList] favorites bulk read failed — rendering favorites unset",
      result.error,
    );
    return items;
  }
  const favoriteIds = new Set(
    result.data.items.filter((s) => s.isFavorite).map((s) => s.entityId),
  );
  return items.map((item) =>
    favoriteIds.has(item.conversationId)
      ? { ...item, isFavorite: true }
      : item,
  );
}

// ── Thunks ───────────────────────────────────────────────────────────────────

export const fetchAgentConversationsNormalized = createAsyncThunk<
  FetchAgentConversationsResult,
  FetchAgentConversationsNormalizedArgs,
  { rejectValue: string }
>(
  "conversationList/fetchAgentConversationsNormalized",
  async (args, { dispatch, rejectWithValue }) => {
    const { agentId, versionFilter } = args;
    const cacheKey = conversationListCacheKey(agentId, versionFilter);

    dispatch(setAgentCacheLoading({ cacheKey, agentId, versionFilter }));

    const rpcArgs: Database["public"]["Functions"]["get_agent_conversations"]["Args"] =
      {
        p_agent_id: agentId,
        ...(versionFilter !== null ? { p_version_number: versionFilter } : {}),
      };

    const { data, error } = await supabase.rpc(
      "get_agent_conversations",
      rpcArgs,
    );

    if (error) {
      dispatch(setAgentCacheError({ cacheKey, error: error.message }));
      return rejectWithValue(error.message);
    }

    const rows = data ?? [];
    const conversations = await applyFavoritesFromUes(
      rows.map(mapRpcRowToConversationListItem),
    );

    dispatch(
      setAgentCacheSuccess({
        cacheKey,
        agentId,
        versionFilter,
        items: conversations,
      }),
    );

    return {
      cacheKey,
      request: { agentId, versionFilter },
      conversations,
    };
  },
);

/**
 * Public thunk — accepts agentId OR instanceId. Resolves map-key → canonical
 * agx_agent.id before dispatching the RPC-backed normalized thunk.
 */
export function fetchAgentConversations(
  input: FetchAgentConversationsArgInput,
): AppThunk<Promise<FetchAgentConversationsResult>> {
  return async (dispatch, getState) => {
    const resolved = resolveCanonicalAgentIdForConversationsFetch(
      input,
      getState() as RootState,
    );
    if (!resolved) {
      throw new Error(
        "fetchAgentConversations: pass agentId or a valid instanceId with an execution instance",
      );
    }
    const { canonicalAgentId, versionFilter } = resolved;
    return dispatch(
      fetchAgentConversationsNormalized({
        agentId: canonicalAgentId,
        versionFilter,
      }),
    ).unwrap();
  };
}

// ── Global list thunk (Phase 7) ──────────────────────────────────────────────

export interface FetchGlobalConversationsArgs {
  limit?: number;
  offset?: number;
  replace?: boolean;
}

export interface FetchGlobalConversationsResult {
  items: ConversationListItem[];
  hasMore: boolean;
}

/**
 * Fetches the signed-in user's most recent conversations across all agents.
 * Reads directly from `cx_conversation` — the table is RLS-filtered to the
 * requesting user, so no agent scoping is required. Used by the `(a)/chat`
 * global history sidebar.
 */
export const fetchGlobalConversations = createAsyncThunk<
  FetchGlobalConversationsResult,
  FetchGlobalConversationsArgs | void,
  { rejectValue: string }
>(
  "conversationList/fetchGlobalConversations",
  async (rawArgs, { dispatch, rejectWithValue }) => {
    // `void` is identical to `undefined` at runtime; cast enables optional chaining
    const args = rawArgs as FetchGlobalConversationsArgs | undefined;
    const limit = args?.limit ?? CONVERSATION_LIST_PAGE_SIZE;
    const offset = args?.offset ?? 0;
    const replace = args?.replace ?? true;

    dispatch(setGlobalListLoading());

    const { data, error } = await supabase
      .schema("chat").from("conversation")
      .select(
        "id, title, description, status, message_count, initial_agent_id, last_model_id, source_app, source_feature, created_at, updated_at, exclude_from_kg",
      )
      .is("deleted_at", null)
      .eq("is_ephemeral", false)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      dispatch(setGlobalListError(error.message));
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

    const hasMore = items.length === limit;
    dispatch(setGlobalListSuccess({ items, hasMore, replace }));

    return { items, hasMore };
  },
);
