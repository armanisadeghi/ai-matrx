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
 */

import { supabase } from "@/utils/supabase/client";
import type { Database, Json } from "@/types/database.types";
import type { ConversationVisibility } from "@/features/cx-chat/types/cx-tables";
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
  // Legacy parity fields — populated only by the fallback path that
  // queries observability tables directly (the RPC's bundle doesn't carry
  // user_requests / requests with the older-pages join).
  userRequests?: CxUserRequestRow[];
  requests?: CxRequestRow[];
}

export interface CxConversationRow {
  id: string;
  /** Canonical owner — trigger-stamped `cx_conversation.created_by`. */
  created_by: string | null;
  title: string | null;
  description: string | null;
  keywords: string[] | null;
  system_instruction: string | null;
  status: string;
  message_count: number;
  config: Json;
  metadata: Json;
  variables: Json;
  overrides: Json;
  last_model_id: string | null;
  initial_agent_id: string | null;
  initial_agent_version_id: string | null;
  parent_conversation_id: string | null;
  forked_from_id: string | null;
  forked_at_position: number | null;
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;
  /** Per-conversation sandbox override (power-user pin). NULL → user-active. */
  sandbox_instance_id: string | null;
  /** Canonical access-control dimension — `cx_conversation.visibility`. */
  visibility: ConversationVisibility;
  is_ephemeral: boolean;
  source_app: string;
  source_feature: string;
  created_at: string;
  updated_at: string;
}

export interface CxMessageRow {
  id: string;
  conversation_id: string;
  agent_id: string | null;
  role: string;
  content: Json;
  content_history: Json | null;
  user_content: Json | null;
  position: number;
  source: string;
  status: string;
  is_visible_to_model: boolean;
  is_visible_to_user: boolean;
  metadata: Json;
  created_at: string;
  deleted_at: string | null;
  // Per-turn structured columns (jsonb, nullable). The bundle RPC returns these
  // via `to_jsonb`, so they arrive as already-parsed JSON values.
  tools_on_call: Json | null;
  model_context: Json | null;
  error: Json | null;
  voice: Json | null;
}

export interface CxToolCallRow {
  id: string;
  conversation_id: string;
  user_request_id: string | null;
  message_id: string | null;
  user_id: string;
  call_id: string;
  tool_name: string;
  tool_name_as_called: string | null;
  tool_type: string;
  iteration: number;
  status: string;
  success: boolean;
  is_error: boolean | null;
  error_type: string | null;
  error_message: string | null;
  arguments: Json;
  output: string | null;
  output_chars: number;
  output_preview: Json | null;
  output_type: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  duration_ms: number;
  started_at: string;
  completed_at: string;
  parent_call_id: string | null;
  retry_count: number | null;
  persist_key: string | null;
  file_path: string | null;
  execution_events: Json | null;
  metadata: Json;
  created_at: string;
  deleted_at: string | null;
}

/** Mirrors `public.cx_user_request.Row` plus optional legacy join fields. */
export type CxUserRequestRow =
  Database["public"]["Tables"]["cx_user_request"]["Row"] & {
    /**
     * No longer a column on `cx_user_request` — a user request maps to one
     * conversation but spawns many `cx_request` rows, so the conversation is
     * resolved through that m2m. Optional here for back-compat with any legacy
     * payload that still includes it; the owning conversationId is passed
     * explicitly to {@link userRequestRowToRecord}.
     */
    conversation_id?: string | null;
  };

export interface CxRequestRow {
  id: string;
  conversation_id: string;
  user_request_id: string;
  ai_model_id: string;
  api_class: string | null;
  iteration: number;
  response_id: string | null;
  finish_reason: string | null;
  input_tokens: number | null;
  cached_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost: number | null;
  total_duration_ms: number | null;
  api_duration_ms: number | null;
  tool_duration_ms: number | null;
  tool_calls_count: number | null;
  tool_calls_details: Json | null;
  metadata: Json;
  created_at: string;
  deleted_at: string | null;
}

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
    if (!error && data) {
      return data as unknown as CxConversationBundle;
    }
    // eslint-disable-next-line no-console
    console.warn(
      "[conversation-bundle] RPC unavailable — falling back to parallel queries.",
      describeSupabaseError(error),
    );
  } catch (rpcErr) {
    // eslint-disable-next-line no-console
    console.warn(
      "[conversation-bundle] RPC threw — falling back to parallel queries.",
      describeSupabaseError(rpcErr),
    );
  }

  // Fallback. Runs when the RPC isn't deployed or errors transiently.
  // Shape mirrors the RPC contract so downstream code is uniform.
  // Mirror the RPC's visibility filter: only user-visible messages reach the
  // client. Without this, the fallback path (RPC unavailable) would leak
  // hidden rows (e.g. condensation summaries, secret agent_template scaffolding
  // flagged is_visible_to_user=false) that the RPC correctly excludes.
  const messageQuery = supabase
    .from("cx_message")
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
    : supabase
        .from("cx_request")
        .select("*")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

  const [conversationRes, messagesRes, requestsRes] = await Promise.all([
    supabase
      .from("cx_conversation")
      .select("*")
      .eq("id", conversationId)
      .single(),
    messageQuery,
    requestsQuery,
  ]);

  let userRequestsRes: { data: CxUserRequestRow[] | null } = { data: [] };
  if (!skipObservabilityFallback) {
    const reqRows = (requestsRes?.data ?? []) as unknown as CxRequestRow[];
    const userRequestIds = Array.from(
      new Set(reqRows.map((r) => r.user_request_id).filter(Boolean)),
    );
    if (userRequestIds.length > 0) {
      userRequestsRes = await supabase
        .from("cx_user_request")
        .select("*")
        .in("id", userRequestIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
    }
  }

  if (conversationRes.error) {
    // eslint-disable-next-line no-console
    console.error(
      "[conversation-bundle] cx_conversation query error:",
      describeSupabaseError(conversationRes.error),
    );
    throw conversationRes.error;
  }
  if (!conversationRes.data) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const rawMessages = (messagesRes.data ?? []) as unknown as CxMessageRow[];
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
    const toolsRes = await supabase
      .from("cx_tool_call")
      .select("*")
      .in("message_id", messageIds)
      .is("deleted_at", null)
      .order("started_at", { ascending: true });
    toolCalls = (toolsRes.data ?? []) as unknown as CxToolCallRow[];
  }

  const oldestPosition = sortedAsc[0]?.position ?? null;
  let hasMore = false;
  if (oldestPosition != null) {
    const olderCheck = await supabase
      .from("cx_message")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .eq("is_visible_to_user", true)
      .lt("position", oldestPosition);
    hasMore = (olderCheck.count ?? 0) > 0;
  }

  return {
    conversation: conversationRes.data as unknown as CxConversationRow,
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
    userRequests: (userRequestsRes?.data ??
      []) as unknown as CxUserRequestRow[],
    requests: (requestsRes?.data ?? []) as unknown as CxRequestRow[],
  };
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
    userId: row.user_id,
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
    apiClass: row.api_class,
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
    userId: row.user_id,
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
