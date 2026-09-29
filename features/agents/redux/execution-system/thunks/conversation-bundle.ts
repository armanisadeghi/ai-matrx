/**
 * conversation-bundle — shared utilities for the `get_cx_conversation_bundle`
 * RPC. Used by both `loadConversation` (initial hydration) and
 * `loadOlderMessages` (paginated history).
 *
 * The RPC is the single source of truth for any conversation history fetch:
 *   - `p_message_limit` (1..200, default 10) — page size.
 *   - `p_before_position` (smallint cursor) — fetch messages with
 *     `position < p_before_position`. NULL → newest page.
 *   - Returns `messages`, `tool_calls`, `artifacts`, and `media` JOINED to the
 *     page's message IDs, plus a `pagination` block with `oldest_position` and
 *     `has_more` so callers can advance the cursor.
 *   - On the initial load only (`p_before_position` NULL) it also carries the
 *     conversation's run history: `requests` (chat.request) and
 *     `user_requests` (their distinct chat.user_request parents), both
 *     `deleted_at IS NULL`, ordered by created_at, whole rows
 *     (migrations/cx_conversation_bundle_carries_run_history.sql).
 */

import { supabase } from "@/utils/supabase/client";
import { recordUnavailableMessage } from "@/lib/records/recordUnavailable";
import type { Database } from "@/types/database.types";
import type {
  MessageRecord,
  ToolOnCall,
  ModelContext,
  MessageError,
} from "../messages/messages.slice";
import type {
  CxUserRequestRecord,
  CxRequestRecord,
  CxToolCallRecord,
} from "../observability/observability.slice";
import { componentSaver } from "@/lib/provenance/componentSaver";

/**
 * Error code for "the conversation row doesn't exist YET" — a client-minted
 * conversation only gets its `chat.conversation` row when the first turn
 * streams. Loaders treat this as benign (nothing to hydrate), never a failure.
 */
export const CONVERSATION_NOT_MATERIALIZED = "CONVERSATION_NOT_MATERIALIZED";

// =============================================================================
// Bundle shape — mirrors `get_cx_conversation_bundle` return JSONB
// =============================================================================

export interface BundlePagination {
  limit: number;
  returned_count: number;
  oldest_position: number | null;
  has_more: boolean;
}

export interface CxConversationBundle {
  conversation: CxConversationRow;
  messages: CxMessageRow[];
  tool_calls: CxToolCallRow[];
  artifacts: unknown[];
  media: unknown[];
  pagination: BundlePagination;
  // Run history. The RPC sends `requests` + `user_requests` on an initial
  // load and omits both on older pages; the client-side paths below (RPC
  // fallback, `fetchRunHistory`) fill `requests` + `userRequests`.
  userRequests?: CxUserRequestRow[];
  user_requests?: CxUserRequestRow[];
  requests?: CxRequestRow[];
}

/**
 * Canonical row shapes — direct aliases to the generated `chat.*` Rows
 * (`types/database.types.ts`, source of truth). These are read-only projections
 * of the bundle/fallback payload; consumers only read fields off them, never
 * construct them, so the generated superset + stricter nullability is safe.
 * NOTE the generated types are stricter than the old hand-written mirrors:
 *   - `conversation.organization_id` / `message.organization_id` are NON-null
 *     `string` (retrofit backfilled + NOT NULL), not `string | null`.
 */
export type CxConversationRow =
  Database["chat"]["Tables"]["conversation"]["Row"];

export type CxMessageRow = Database["chat"]["Tables"]["message"]["Row"];

export type CxToolCallRow = Database["chat"]["Tables"]["tool_call"]["Row"];

/** Mirrors `public.cx_user_request.Row` plus optional legacy join fields. */
export type CxUserRequestRow =
  Database["chat"]["Tables"]["user_request"]["Row"] & {
    /**
     * No longer a column on `cx_user_request` — a user request maps to one
     * conversation but spawns many `cx_request` rows, so the conversation is
     * resolved through that m2m. Optional here for back-compat with any legacy
     * payload that still includes it; the owning conversationId is passed
     * explicitly to {@link userRequestRowToRecord}.
     */
    conversation_id?: string | null;
  };

/** Canonical row shape — 1:1 with the generated `chat.request` Row. */
export type CxRequestRow = Database["chat"]["Tables"]["request"]["Row"];

// =============================================================================
// Bundle fetch — RPC-first with fallback
// =============================================================================

export interface FetchBundleOptions {
  messageLimit?: number;
  beforePosition?: number | null;
  /**
   * Skip the legacy fallback path that queries `cx_user_request` and
   * `cx_request` directly. Pagination callers should pass `true` — those
   * tables are only useful on the initial hydrate; subsequent pages don't
   * need them because the conversation-level observability is already
   * populated.
   */
  skipObservabilityFallback?: boolean;
}

function describeSupabaseError(err: unknown): Record<string, unknown> {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    return {
      message: e.message,
      code: e.code,
      details: e.details,
      hint: e.hint,
      status: e.status,
      statusCode: e.statusCode,
      name: e.name,
      raw: err,
    };
  }
  return { raw: err };
}

export { describeSupabaseError };

/**
 * Fetches a page of conversation history via `get_cx_conversation_bundle`.
 * Falls back to direct table queries when the RPC is unavailable (dev DBs
 * without the migration applied).
 */
export async function fetchConversationBundle(
  conversationId: string,
  options: FetchBundleOptions = {},
): Promise<CxConversationBundle> {
  const {
    messageLimit = 50,
    beforePosition = null,
    skipObservabilityFallback = false,
  } = options;

  // Preferred: single-round-trip RPC. SQL signature
  // (p_conversation_id uuid, p_message_limit int, p_before_position smallint).
  try {
    const { data, error } = await supabase.rpc("get_cx_conversation_bundle", {
      p_conversation_id: conversationId,
      p_message_limit: messageLimit,
      p_before_position: beforePosition ?? undefined,
    });
    if (!error) {
      // The RPC answers NULL when the conversation has no (visible) row —
      // a client-minted conversation before its first turn. That is an
      // answer, not an unavailable RPC: no fallback round trips.
      const bundle = data as unknown as CxConversationBundle | null;
      if (!bundle?.conversation) {
        // Row doesn't exist yet (pre-first-turn conversation) — benign.
        throw Object.assign(
          new Error(recordUnavailableMessage("conversation", "unknown")),
          { code: CONVERSATION_NOT_MATERIALIZED },
        );
      }
      // The RPC carries the run history (`requests` / `user_requests`) on an
      // initial load since 2026-09-27, so this branch normally never runs.
      // It stays as the fallback for an RPC body that lacks those keys (an
      // older or reverted definition): without the history an initial
      // hydrate seeds nothing into activeRequests, so after a reload every
      // run's tokens, cost and timing read empty and the response-feedback
      // bar (which needs a completed request) vanishes. When it does run it
      // says so. Pagination callers opt out with `skipObservabilityFallback`.
      if (
        !skipObservabilityFallback &&
        bundle.requests === undefined &&
        bundle.userRequests === undefined &&
        bundle.user_requests === undefined
      ) {
        console.warn(
          "[conversation-bundle] get_cx_conversation_bundle returned no run history — reading chat.request / chat.user_request directly. Apply migrations/cx_conversation_bundle_carries_run_history.sql.",
        );
        try {
          const history = await fetchRunHistory(conversationId);
          return { ...bundle, ...history };
        } catch (historyErr) {
          console.warn(
            "[conversation-bundle] run history could not be read; run stats and feedback stay empty for this load.",
            describeSupabaseError(historyErr),
          );
        }
      }
      return bundle;
    }
     
    console.warn(
      "[conversation-bundle] RPC unavailable — falling back to parallel queries.",
      describeSupabaseError(error),
    );
  } catch (rpcErr) {
    // Not an RPC availability problem — the conversation just isn't there
    // yet. Surface it as-is; no fallback round-trip needed.
    if (
      (rpcErr as { code?: string } | null)?.code ===
      CONVERSATION_NOT_MATERIALIZED
    ) {
      throw rpcErr;
    }

    console.warn(
      "[conversation-bundle] RPC threw — falling back to parallel queries.",
      describeSupabaseError(rpcErr),
    );
  }

  // Fallback. Runs when the RPC isn't deployed or errors transiently.
  // Shape mirrors the RPC contract so downstream code is uniform.
  // Mirror the RPC's shown-to-user filter: only user-visible messages reach the
  // client. Without this, the fallback path (RPC unavailable) would leak
  // hidden rows (e.g. condensation summaries, secret agent_template scaffolding
  // flagged is_visible_to_user=false) that the RPC correctly excludes.
  const messageQuery = supabase
    .schema("chat").from("message")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .eq("is_visible_to_user", true)
    .order("position", { ascending: false })
    .limit(Math.max(1, Math.min(messageLimit, 200)));
  if (beforePosition != null) {
    messageQuery.lt("position", beforePosition);
  }

  // `cx_request` keeps `conversation_id`; it's the m2m between conversations
  // and user requests. `cx_user_request` no longer carries `conversation_id`,
  // so we fetch the conversation's requests first, then resolve the distinct
  // parent user_request_ids from them.
  const requestsQuery = skipObservabilityFallback
    ? Promise.resolve({ data: [] as CxRequestRow[] })
    : requestsForConversation(conversationId);

  const [conversationRes, messagesRes, requestsRes] = await Promise.all([
    // maybeSingle, NOT single: a client-minted conversation has no row until
    // its FIRST turn streams (the server creates it then). Loading one of
    // those (e.g. a provisioned-but-unused war-room chat) is an expected
    // state, not a 406 to scream about.
    supabase
      .schema("chat").from("conversation")
      .select("*")
      .eq("id", conversationId)
      .maybeSingle(),
    messageQuery,
    requestsQuery,
  ]);

  let userRequestsRes: { data: CxUserRequestRow[] | null } = { data: [] };
  if (!skipObservabilityFallback) {
    try {
      userRequestsRes = await userRequestsForRequests(requestsRes?.data ?? []);
    } catch (historyErr) {
      console.warn(
        "[conversation-bundle] user_request rows could not be read; run stats stay empty for this load.",
        describeSupabaseError(historyErr),
      );
    }
  }

  if (conversationRes.error) {
     
    console.error(
      "[conversation-bundle] cx_conversation query error:",
      describeSupabaseError(conversationRes.error),
    );
    throw conversationRes.error;
  }
  if (!conversationRes.data) {
    // Recognizable, benign-by-code: callers (loadConversation) treat a
    // not-yet-materialized conversation as "nothing to hydrate", not a failure.
    throw Object.assign(
      new Error(recordUnavailableMessage("conversation", "unknown")),
      { code: CONVERSATION_NOT_MATERIALIZED },
    );
  }

  const rawMessages: CxMessageRow[] = messagesRes.data ?? [];
  // Order by (position, created_at). A failed turn and its retry share a
  // position; created_at keeps the failed attempt just before its retry.
  // See CONVERSATION_FAILURE_AND_RETRY_FE_GUIDE.md.
  const sortedAsc = [...rawMessages].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    if (a.created_at < b.created_at) return -1;
    if (a.created_at > b.created_at) return 1;
    return 0;
  });
  const messageIds = sortedAsc.map((m) => m.id);

  let toolCalls: CxToolCallRow[] = [];
  if (messageIds.length > 0) {
    // VIEW LAW: container-scoped via message_id — messageIds come from this caller's own conversation, fetched above
    const toolsRes = await supabase
      .schema("chat").from("tool_call")
      .select("*")
      .in("message_id", messageIds)
      .is("deleted_at", null)
      .order("started_at", { ascending: true });
    toolCalls = toolsRes.data ?? [];
  }

  const oldestPosition = sortedAsc[0]?.position ?? null;
  let hasMore = false;
  if (oldestPosition != null) {
    const olderCheck = await supabase
      .schema("chat").from("message")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .eq("is_visible_to_user", true)
      .lt("position", oldestPosition);
    hasMore = (olderCheck.count ?? 0) > 0;
  }

  return {
    conversation: conversationRes.data,
    messages: sortedAsc,
    tool_calls: toolCalls,
    artifacts: [],
    media: [],
    pagination: {
      limit: messageLimit,
      returned_count: sortedAsc.length,
      oldest_position: oldestPosition,
      has_more: hasMore,
    },
    userRequests: userRequestsRes?.data ?? [],
    requests: requestsRes?.data ?? [],
  };
}

// `cx_request` keeps `conversation_id`; it's the m2m between conversations and
// user requests. `cx_user_request` no longer carries `conversation_id`, so a
// conversation's run history is its requests first, then their distinct
// parent user_request rows.
function requestsForConversation(conversationId: string) {
  return supabase
    .schema("chat").from("request")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
}

async function userRequestsForRequests(
  reqRows: CxRequestRow[],
): Promise<{ data: CxUserRequestRow[] | null }> {
  const userRequestIds = Array.from(
    new Set(reqRows.map((r) => r.user_request_id).filter(Boolean)),
  );
  if (userRequestIds.length === 0) return { data: [] };
  const res = await supabase
    .schema("chat").from("user_request")
    .select("*")
    .in("id", userRequestIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (res.error) throw res.error;
  return res;
}

/** A conversation's run history, in the bundle's shape. Throws on a read error. */
async function fetchRunHistory(conversationId: string): Promise<{
  requests: CxRequestRow[];
  userRequests: CxUserRequestRow[];
}> {
  const requestsRes = await requestsForConversation(conversationId);
  if (requestsRes.error) throw requestsRes.error;
  const requests = (requestsRes.data ?? []) as CxRequestRow[];
  const userRequestsRes = await userRequestsForRequests(requests);
  return { requests, userRequests: userRequestsRes.data ?? [] };
}

// =============================================================================
// Row → Record converters
// =============================================================================

export function messageRowToRecord(row: CxMessageRow): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    agentId: row.agent_id,
    role: (row.role as MessageRecord["role"]) ?? "user",
    content: row.content,
    contentHistory: row.content_history,
    userContent: row.user_content,
    position: row.position,
    source: row.source,
    status: row.status,
    isVisibleToModel: row.is_visible_to_model,
    isVisibleToUser: row.is_visible_to_user,
    metadata: row.metadata,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    // Per-turn structured columns — copied through verbatim. The RPC already
    // returns parsed JSON; we narrow each to its typed view at the boundary.
    toolsOnCall: (row.tools_on_call as ToolOnCall[] | null) ?? null,
    modelContext: (row.model_context as ModelContext | null) ?? null,
    error: (row.error as MessageError | null) ?? null,
    voice: row.voice,
  };
}

export function userRequestRowToRecord(
  row: CxUserRequestRow,
  conversationId: string,
): CxUserRequestRecord {
  return {
    id: row.id,
    // Sourced from the owning conversation (the bundle's conversation), not the
    // row — `cx_user_request` no longer carries `conversation_id`. Fall back to
    // any legacy value on the row if present.
    conversationId: conversationId ?? row.conversation_id ?? "",
    userId: row.created_by ?? "",
    agentId: row.agent_id,
    agentVersionId: row.agent_version_id,
    status: row.status,
    iterations: row.iterations,
    finishReason: row.finish_reason,
    error: row.error,
    triggerMessagePosition: null,
    resultStartPosition: null,
    resultEndPosition: null,
    totalInputTokens: row.total_input_tokens,
    totalOutputTokens: row.total_output_tokens,
    totalCachedTokens: row.total_cached_tokens,
    totalTokens: row.total_tokens,
    totalToolCalls: row.total_tool_calls,
    totalCost: row.total_cost,
    totalDurationMs: row.total_duration_ms,
    apiDurationMs: row.api_duration_ms,
    toolDurationMs: row.tool_duration_ms,
    sourceApp: row.source_app,
    sourceFeature: row.source_feature,
    metadata: row.metadata,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at,
  };
}

export function requestRowToRecord(row: CxRequestRow): CxRequestRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userRequestId: row.user_request_id,
    aiModelId: row.ai_model_id,
    iteration: row.iteration,
    responseId: row.response_id,
    finishReason: row.finish_reason,
    inputTokens: row.input_tokens,
    cachedTokens: row.cached_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    cost: row.cost,
    totalDurationMs: row.total_duration_ms,
    apiDurationMs: row.api_duration_ms,
    toolDurationMs: row.tool_duration_ms,
    toolCallsCount: row.tool_calls_count,
    toolCallsDetails: row.tool_calls_details,
    metadata: row.metadata,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

export function toolCallRowToRecord(row: CxToolCallRow): CxToolCallRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userRequestId: row.user_request_id,
    messageId: row.message_id,
    // Who SAVED the call (updated_by) — never created_by, which on this
    // component is the conversation's owner. "" = unknown (a server write).
    userId: componentSaver(row) ?? "",
    callId: row.call_id,
    toolName: row.tool_name,
    toolNameAsCalled: row.tool_name_as_called ?? null,
    toolType: row.tool_type,
    iteration: row.iteration,
    status: row.status,
    success: row.success,
    isError: row.is_error,
    errorType: row.error_type,
    errorMessage: row.error_message,
    arguments: row.arguments,
    output: row.output,
    outputChars: row.output_chars,
    outputPreview: row.output_preview,
    outputType: row.output_type,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    costUsd: row.cost_usd,
    durationMs: row.duration_ms,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    parentCallId: row.parent_call_id,
    retryCount: row.retry_count,
    persistKey: row.persist_key,
    filePath: row.file_path,
    executionEvents: row.execution_events,
    metadata: row.metadata,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * Normalize the bundle's tool_calls payload — accepts both snake_case
 * (`tool_calls`) and camelCase (`toolCalls`) keys so the slice never
 * silently drops data if the server ever shifts conventions.
 */
export function extractBundleToolCalls(
  bundle: CxConversationBundle,
): CxToolCallRow[] {
  const bundleAny = bundle as unknown as {
    tool_calls?: CxToolCallRow[];
    toolCalls?: CxToolCallRow[];
  };
  return bundleAny.tool_calls ?? bundleAny.toolCalls ?? [];
}
