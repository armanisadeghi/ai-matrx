/**
 * loadConversation — single-entry rehydration of a conversation from the DB.
 *
 * Fetches everything needed to reopen a past conversation and dispatches into
 * the 6 per-conversation dimensions: conversation record, messages, variables
 * (persisted values), model overrides (persisted values), display/context
 * (from metadata), and observability (cx_user_request / cx_request /
 * cx_tool_call records).
 *
 * Target RPC: `get_cx_conversation_bundle(conversation_id uuid)` — a single
 * round-trip that returns the full bundle. Until the RPC ships, this thunk
 * falls back to parallel table queries that produce the same shape. The
 * fallback is marked clearly so it can be stripped in one edit once the RPC
 * lands and types are regenerated.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { Json } from "@/types/database.types";

import {
  hydrateConversation,
  setConversationLabel,
} from "../conversations/conversations.slice";
import {
  hydrateMessages,
  type MessageRecord,
} from "../messages/messages.slice";
import {
  hydrateObservability,
  type CxUserRequestRecord,
  type CxRequestRecord,
  type CxToolCallRecord,
} from "../observability/observability.slice";
import {
  initInstanceVariables,
  setUserVariableValues,
} from "../instance-variable-values/instance-variable-values.slice";
import {
  initInstanceOverrides,
  setOverrides,
} from "../instance-model-overrides/instance-model-overrides.slice";
import { initInstanceUIState } from "../instance-ui-state/instance-ui-state.slice";
import {
  initInstanceContext,
  setContextEntries,
} from "../instance-context/instance-context.slice";
import { setFocus } from "../conversation-focus/conversation-focus.slice";
import {
  setMemoryMetadata,
  type ObservationalMemoryMetadata,
} from "../observational-memory/observational-memory.slice";
import { loadCodeEditHistoryThunk } from "@/features/code/redux/codeEditHistoryHydration";

// =============================================================================
// Bundle shape
//
// Matches the `get_cx_conversation_bundle(uuid, int, smallint)` RPC return.
// The RPC returns JSONB keyed with snake_case table names; this thunk maps
// them onto the camelCase slice actions.
//
// Supported pagination args (exposed by the RPC):
//   p_message_limit      — default 10, clamped to [1, 200]
//   p_before_position    — cursor; fetch messages with position < this
//
// Artifacts and media are scoped to the returned messages only; older
// turns are loaded separately via a future `loadOlderMessages` thunk.
// =============================================================================

interface CxConversationBundle {
  conversation: CxConversationRow;
  messages: CxMessageRow[];
  tool_calls: CxToolCallRow[];
  artifacts: unknown[];
  media: unknown[];
  pagination: {
    limit: number;
    returned_count: number;
    oldest_position: number | null;
    has_more: boolean;
  };
  // Legacy parity fields — unused by the current RPC but populated when the
  // fallback path (parallel table queries) runs, so the downstream commit
  // logic can handle observability without branching.
  userRequests?: CxUserRequestRow[];
  requests?: CxRequestRow[];
}

// Minimal row aliases — intentionally loose (the generated types aren't all
// available for the new surfaces yet). Each has only the fields we read here.

interface CxConversationRow {
  id: string;
  user_id: string;
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
  is_public: boolean;
  is_ephemeral: boolean;
  source_app: string;
  source_feature: string;
  created_at: string;
  updated_at: string;
}

interface CxMessageRow {
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
}

interface CxToolCallRow {
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

interface CxUserRequestRow {
  id: string;
  conversation_id: string;
  user_id: string;
  agent_id: string | null;
  agent_version_id: string | null;
  status: string;
  iterations: number;
  finish_reason: string | null;
  error: string | null;
  trigger_message_position: number | null;
  result_start_position: number | null;
  result_end_position: number | null;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_tokens: number;
  total_tokens: number;
  total_tool_calls: number;
  total_cost: number | null;
  total_duration_ms: number | null;
  api_duration_ms: number | null;
  tool_duration_ms: number | null;
  source_app: string;
  source_feature: string;
  metadata: Json;
  created_at: string;
  completed_at: string | null;
  deleted_at: string | null;
}

interface CxRequestRow {
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

interface FetchBundleOptions {
  messageLimit?: number;
  beforePosition?: number | null;
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

async function fetchConversationBundle(
  conversationId: string,
  options: FetchBundleOptions = {},
): Promise<CxConversationBundle> {
  const { messageLimit = 50, beforePosition = null } = options;

  // Auth diagnostics — needed because RLS-denied reads return as
  // `PGRST116` (0 rows) with empty-looking errors, and the most common
  // root cause is the browser session not being hydrated when the
  // thunk fires.
  try {
    const { data: authData } = await supabase.auth.getUser();
    // eslint-disable-next-line no-console
    console.log(
      "[loadConversation] auth at fetch time: userId=%s conversationId=%s",
      authData?.user?.id ?? "(none)",
      conversationId,
    );
  } catch (authErr) {
    // eslint-disable-next-line no-console
    console.warn(
      "[loadConversation] auth.getUser() threw:",
      describeSupabaseError(authErr),
    );
  }

  // Preferred: single-round-trip RPC (`get_cx_conversation_bundle`) — SQL
  // signature: (p_conversation_id uuid, p_message_limit int, p_before_position smallint).
  try {
    const { data, error } = await supabase.rpc("get_cx_conversation_bundle", {
      p_conversation_id: conversationId,
      p_message_limit: messageLimit,
      p_before_position: beforePosition ?? undefined,
    });
    if (!error && data) {
      const bundle = data as unknown as CxConversationBundle;
      return bundle;
    }
    // eslint-disable-next-line no-console
    console.warn(
      "[loadConversation] RPC unavailable — falling back to parallel queries.",
      describeSupabaseError(error),
    );
  } catch (rpcErr) {
    // eslint-disable-next-line no-console
    console.warn(
      "[loadConversation] RPC threw — falling back to parallel queries.",
      describeSupabaseError(rpcErr),
    );
  }

  // Fallback: parallel table queries. Runs if the RPC isn't deployed (dev
  // DB) or errors transiently. Shape matches the RPC contract.
  const [
    conversationRes,
    messagesRes,
    toolCallsRes,
    userRequestsRes,
    requestsRes,
  ] = await Promise.all([
    supabase
      .from("cx_conversation")
      .select("*")
      .eq("id", conversationId)
      .single(),
    supabase
      .from("cx_message")
      .select("*")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("position", { ascending: true }),
    supabase
      .from("cx_tl_call")
      .select("*")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("started_at", { ascending: true }),
    supabase
      .from("cx_user_request")
      .select("*")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("cx_request")
      .select("*")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);

  if (conversationRes.error) {
    // eslint-disable-next-line no-console
    console.error(
      "[loadConversation] cx_conversation query error:",
      describeSupabaseError(conversationRes.error),
    );
    throw conversationRes.error;
  }
  if (!conversationRes.data) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const messages = (messagesRes.data ?? []) as unknown as CxMessageRow[];
  // eslint-disable-next-line no-console
  // console.log(
  //   "[loadConversation] Fallback queries: messages=%d toolCalls=%d userRequests=%d requests=%d",
  //   messages.length,
  //   toolCallsRes.data?.length ?? 0,
  //   userRequestsRes.data?.length ?? 0,
  //   requestsRes.data?.length ?? 0,
  // );
  if (messagesRes.error) {
    // eslint-disable-next-line no-console
    console.error(
      "[loadConversation] cx_message query error:",
      describeSupabaseError(messagesRes.error),
    );
  }
  return {
    conversation: conversationRes.data as unknown as CxConversationRow,
    messages,
    tool_calls: (toolCallsRes.data ?? []) as unknown as CxToolCallRow[],
    artifacts: [],
    media: [],
    pagination: {
      limit: messageLimit,
      returned_count: messages.length,
      oldest_position: messages[0]?.position ?? null,
      has_more: false,
    },
    userRequests: (userRequestsRes.data ?? []) as unknown as CxUserRequestRow[],
    requests: (requestsRes.data ?? []) as unknown as CxRequestRow[],
  };
}

// =============================================================================
// Row → Record converters
// =============================================================================

function messageRowToRecord(row: CxMessageRow): MessageRecord {
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
  };
}

function userRequestRowToRecord(row: CxUserRequestRow): CxUserRequestRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    agentId: row.agent_id,
    agentVersionId: row.agent_version_id,
    status: row.status,
    iterations: row.iterations,
    finishReason: row.finish_reason,
    error: row.error,
    triggerMessagePosition: row.trigger_message_position,
    resultStartPosition: row.result_start_position,
    resultEndPosition: row.result_end_position,
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

function requestRowToRecord(row: CxRequestRow): CxRequestRecord {
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

function toolCallRowToRecord(row: CxToolCallRow): CxToolCallRecord {
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

// =============================================================================
// Thunk
// =============================================================================

export interface LoadConversationArgs {
  conversationId: string;
  /** Optional — surface key to set focus on after rehydration. */
  surfaceKey?: string;
  /**
   * How many recent messages to fetch. Forwarded to the
   * `get_cx_conversation_bundle(..., p_message_limit, ...)` RPC arg. RPC
   * clamps to [1, 200]. Default 50.
   */
  messageLimit?: number;
  /**
   * Optional cursor: only fetch messages with `position < beforePosition`.
   * Used for pagination when scrolling older turns into view.
   */
  beforePosition?: number | null;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

/**
 * Rehydrates a single conversation from the DB. Restores all six dimensions:
 *   - `conversations/` — identity, scope, sidebar fields, invocation origin
 *   - `messages/` — DB-faithful MessageRecords, ordered by position
 *   - `variables/` — `persistedValues` from cx_conversation.variables
 *   - `modelConfig/` — base + persisted overrides + last_model_id
 *   - `context/` — from cx_conversation.metadata.context
 *   - `observability/` — cx_user_request + cx_request + cx_tool_call records
 *
 * Also sets focus on the given surface (if provided), so the UI can point the
 * user directly at the rehydrated conversation.
 */
export const loadConversation = createAsyncThunk<
  { conversationId: string },
  LoadConversationArgs,
  ThunkApi
>(
  "conversations/load",
  async (
    { conversationId, surfaceKey, messageLimit, beforePosition },
    { dispatch },
  ) => {
    // eslint-disable-next-line no-console
    // console.log(
    //   "[loadConversation] START cid=%s surfaceKey=%s",
    //   conversationId,
    //   surfaceKey ?? "(none)",
    // );
    // Kick off the AI edit-history fetch in parallel with the
    // conversation bundle. We don't await the result here — the
    // history hook hydrates the slice itself, and the chat surface
    // doesn't depend on history rows for its first paint. Stale
    // history would also be fine; nothing in the message render
    // pipeline reads from `codeEditHistory`.
    const historyPromise = dispatch(loadCodeEditHistoryThunk(conversationId));

    let bundle: CxConversationBundle;
    try {
      bundle = await fetchConversationBundle(conversationId, {
        messageLimit,
        beforePosition,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        "[loadConversation] fetchConversationBundle failed:",
        describeSupabaseError(err),
      );
      // Don't leave the history fetch dangling on a bundle failure.
      void historyPromise;
      throw err;
    }
    // Surface a single dev-only warning if the history fetch fails
    // separately from the bundle — never block hydration on it.
    void historyPromise.catch?.(() => undefined);
    const conv = bundle.conversation;
    // eslint-disable-next-line no-console
    // console.log(
    //   "[loadConversation] bundle received: conv=%s messages=%d toolCalls=%d",
    //   conv?.id ?? "(none)",
    //   bundle.messages?.length ?? 0,
    //   bundle.tool_calls?.length ?? 0,
    // );

    // ── 1. Conversation record (includes sidebar + scope + relation fields) ──
    dispatch(
      hydrateConversation({
        conversationId,
        agentId: conv.initial_agent_id ?? "",
        agentType: "user",
        origin: "manual",
        shortcutId: null,
        status: "ready",
        sourceApp: conv.source_app,
        // Cast is safe — source_feature is stored as a plain string on the row
        // but the client-side type narrows to a known enum.
        sourceFeature: conv.source_feature as never,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
        userId: conv.user_id,
        initialAgentId: conv.initial_agent_id,
        initialAgentVersionId: conv.initial_agent_version_id,
        lastModelId: conv.last_model_id,
        parentConversationId: conv.parent_conversation_id,
        forkedFromId: conv.forked_from_id,
        forkedAtPosition: conv.forked_at_position,
        organizationId: conv.organization_id,
        projectId: conv.project_id,
        taskId: conv.task_id,
        isEphemeral: conv.is_ephemeral,
        isPublic: conv.is_public,
        title: conv.title,
        description: conv.description,
        keywords: conv.keywords,
        systemInstruction: conv.system_instruction,
        persistedStatus: conv.status === "archived" ? "archived" : "active",
        messageCount: conv.message_count,
        metadata:
          typeof conv.metadata === "object" && conv.metadata !== null
            ? (conv.metadata as Record<string, unknown>)
            : undefined,
      }),
    );

    // Label (title/description/keywords) — already set above, but also fire the
    // dedicated action so any subscribers waiting on that signal get notified.
    dispatch(
      setConversationLabel({
        conversationId,
        title: conv.title,
        description: conv.description,
        keywords: conv.keywords,
      }),
    );

    // ── 2. Messages (DB-faithful) ────────────────────────────────────────────
    const messageRecords = bundle.messages.map(messageRowToRecord);
    // eslint-disable-next-line no-console
    // console.log(
    //   "[loadConversation] hydrateMessages dispatching %d records. first=%o last=%o",
    //   messageRecords.length,
    //   messageRecords[0]
    //     ? {
    //         id: messageRecords[0].id,
    //         role: messageRecords[0].role,
    //         pos: messageRecords[0].position,
    //       }
    //     : null,
    //   messageRecords[messageRecords.length - 1]
    //     ? {
    //         id: messageRecords[messageRecords.length - 1].id,
    //         role: messageRecords[messageRecords.length - 1].role,
    //         pos: messageRecords[messageRecords.length - 1].position,
    //       }
    //     : null,
    // );

    dispatch(hydrateMessages({ conversationId, messages: messageRecords }));

    // ── 3. Variables — stamp the DB `variables` JSON into userValues so the
    // user picks up right where they left off. A future pass can introduce a
    // dedicated `persistedValues` field on the entry to distinguish "server
    // said this was last-set" from "user just typed it"; today they're the
    // same on the reload path by construction.
    dispatch(
      initInstanceVariables({
        conversationId,
        definitions: [],
        scopeValues: {},
      }),
    );
    const persistedVariables =
      typeof conv.variables === "object" && conv.variables !== null
        ? (conv.variables as Record<string, unknown>)
        : {};
    if (Object.keys(persistedVariables).length > 0) {
      dispatch(
        setUserVariableValues({
          conversationId,
          values: persistedVariables,
        }),
      );
    }

    // ── 4. Model config (overrides + last model id) ──────────────────────────
    dispatch(
      initInstanceOverrides({
        conversationId,
        baseSettings: {},
      }),
    );
    if (
      typeof conv.overrides === "object" &&
      conv.overrides !== null &&
      Object.keys(conv.overrides as Record<string, unknown>).length > 0
    ) {
      dispatch(
        setOverrides({
          conversationId,
          changes: conv.overrides as Record<string, unknown>,
        }),
      );
    }

    // ── 5. Display + context (stored under metadata.display / metadata.context
    //      per the Phase 7 decision — config is server-strict) ────────────────
    const metaObj =
      typeof conv.metadata === "object" && conv.metadata !== null
        ? (conv.metadata as Record<string, unknown>)
        : {};
    const displayMeta =
      (metaObj.display as Record<string, unknown> | undefined) ?? undefined;
    if (displayMeta) {
      dispatch(
        initInstanceUIState({
          conversationId,
          ...displayMeta,
        } as never),
      );
    }

    const contextMeta =
      (metaObj.context as Record<string, unknown> | undefined) ?? undefined;
    if (contextMeta) {
      dispatch(initInstanceContext({ conversationId }));
      dispatch(
        setContextEntries({
          conversationId,
          entries: Object.entries(contextMeta).map(([key, value]) => ({
            key,
            value,
          })),
        }),
      );
    }

    // ── 5b. Observational Memory (admin-gated per-conversation feature) ──────
    // The `observational_memory` block on cx_conversation.metadata persists the
    // admin's enable/disable + model + scope choices across turns. Hydrating
    // it here ensures the Creator Panel toggle and the ObservationalMemory
    // window both reflect the server-confirmed state the moment a past
    // conversation is reopened.
    const memoryMeta = metaObj.observational_memory as
      | ObservationalMemoryMetadata
      | undefined
      | null;
    if (memoryMeta && typeof memoryMeta === "object") {
      dispatch(
        setMemoryMetadata({
          conversationId,
          metadata: memoryMeta,
        }),
      );
    }

    // ── 6. Observability ─────────────────────────────────────────────────────
    // Accept both `tool_calls` (snake_case, RPC contract) and `toolCalls`
    // (camelCase, in case the server ever shifts to JS-style keys). One of
    // them must be present and is the authoritative source for args + output
    // on every persisted tool call.
    const bundleAny = bundle as unknown as {
      tool_calls?: CxToolCallRow[];
      toolCalls?: CxToolCallRow[];
      userRequests?: CxUserRequestRow[];
      user_requests?: CxUserRequestRow[];
      requests?: CxRequestRow[];
    };
    const rawToolCalls = bundleAny.tool_calls ?? bundleAny.toolCalls ?? [];
    const rawUserRequests =
      bundleAny.userRequests ?? bundleAny.user_requests ?? [];
    const rawRequests = bundleAny.requests ?? [];

    if (
      rawToolCalls.length === 0 &&
      bundle.messages.some((m) => m.role === "tool")
    ) {
      // The conversation has tool turns but the bundle returned zero
      // cx_tool_call rows — args/results will appear empty. This is a
      // server-side fetch problem (RPC missing the join, RLS hiding
      // rows, or field-name drift). Surface it loudly so we don't
      // silently render empty tool cards.
      // eslint-disable-next-line no-console
      console.warn(
        "[loadConversation] cid=%s has tool messages but bundle.tool_calls is empty — check RPC return shape",
        conversationId,
      );
    }

    dispatch(
      hydrateObservability({
        conversationId,
        userRequests: rawUserRequests.map(userRequestRowToRecord),
        requests: rawRequests.map(requestRowToRecord),
        toolCalls: rawToolCalls.map(toolCallRowToRecord),
      }),
    );

    // ── 7. Focus (if a surface was given) ────────────────────────────────────
    if (surfaceKey) {
      dispatch(setFocus({ surfaceKey, conversationId }));
    }

    // eslint-disable-next-line no-console
    // console.log(
    //   "[loadConversation] DONE cid=%s — all 7 dimensions hydrated",
    //   conversationId,
    // );
    return { conversationId };
  },
);
