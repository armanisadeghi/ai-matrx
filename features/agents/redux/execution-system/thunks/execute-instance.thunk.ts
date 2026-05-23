/**
 * Execute Instance Thunk
 *
 * THE critical thunk — the single place where all slices converge.
 * Reads across every layer to assemble the request payload, fires the API
 * call, and manages the NDJSON stream lifecycle.
 *
 * Routing logic (automatic, no call-site changes needed):
 *   - Turn 1 (no conversationId):  POST /api/ai/agents/{agentId}
 *   - Turn 2+ (conversationId exists): POST /api/ai/conversations/{conversationId}
 *
 * This thunk:
 *   1. Checks for existing conversationId to route to the correct endpoint
 *   2. Assembles the snake_case payload from instance slices + appContextSlice
 *   3. Adds auth headers from userSlice (Bearer token or X-Fingerprint-ID)
 *   4. Resolves the base URL from apiConfigSlice
 *   5. Reads conversation_id from X-Conversation-ID response header
 *   6. Processes the NDJSON stream using canonical stream-events types
 *   7. Appends completed turns to messages
 *   8. Updates request status throughout
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { AssembledAgentStartRequest } from "@/features/agents/types/request.types";
import { buildToolInjection } from "../utils/build-tool-injection";
import type { MessagePart } from "@/types/python-generated/stream-events";
import { generateRequestId } from "../utils/ids";
import { setInstanceStatus } from "../conversations/conversations.slice";
import {
  selectEditorResourceXml,
  selectResourcePayloads,
} from "../instance-resources/instance-resources.selectors";
import { selectResolvedVariables } from "../instance-variable-values/instance-variable-values.selectors";
import { selectSettingsOverridesForApi } from "../instance-model-overrides/instance-model-overrides.selectors";
import { selectContextPayload } from "../instance-context/instance-context.selectors";
import {
  buildAmbientContext,
  isFirstTurn,
} from "@/features/agents/ui-first-tools/redux/build-ambient-context";
import {
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
} from "@/lib/redux/slices/appContextSlice";
import { resolveBackendForConversation } from "./resolve-base-url";
import {
  createRequest,
  setRequestStatus,
} from "../active-requests/active-requests.slice";
import { addOptimisticUserMessage } from "../messages/messages.slice";
import { selectMessageCount } from "../messages/messages.selectors";
import { v4 as uuidv4 } from "uuid";
import { processStream } from "./process-stream";
import { formatVariablesForDisplay } from "@/features/agents/utils/variable-utils";
import {
  selectIsBlockMode,
  selectIsMemoryToggleRequested,
  selectIsSnapshot,
  selectMemoryModel,
  selectMemoryScope,
  selectMemoryToggleTarget,
} from "../instance-ui-state/instance-ui-state.selectors";
import { clearMemoryToggleRequest } from "../instance-ui-state/instance-ui-state.slice";
import { setMemoryEnabledOptimistic } from "../observational-memory/observational-memory.slice";
import {
  registerAbortController,
  unregisterAbortController,
} from "./abort-registry";
import { assertConversationIdMatches } from "../utils/assert-conversation-id";
import { toast } from "sonner";

// =============================================================================
// Assemble Request (pure selector logic, extracted for testability)
// =============================================================================

/**
 * Assembles the complete snake_case API request payload from all slices.
 * Scope fields are read from appContextSlice — the single source of truth.
 * This is a pure function of the Redux state — no side effects.
 */
export function assembleRequest(
  state: RootState,
  conversationId: string,
): AssembledAgentStartRequest | null {
  const instance = state.conversations.byConversationId[conversationId];
  if (!instance) return null;

  const uiState = state.instanceUIState.byConversationId[conversationId];
  if (uiState?.showPreExecutionGate && !uiState.preExecutionSatisfied) {
    console.error(
      `[assembleRequest] BLOCKED: conversation ${conversationId} requires pre-execution input that has not been satisfied.`,
    );
    return null;
  }

  // User input
  // DATA CONTRACT: never modify the user's typed text. Whitespace,
  // trailing newlines, leading spaces — all of it is meaningful
  // (e.g. fenced code blocks, indented markdown, deliberate blank lines).
  // We send exactly what the user typed.
  const userInputState =
    state.instanceUserInput.byConversationId[conversationId];
  const rawTextInput = userInputState?.text ?? "";
  const messageParts = userInputState?.messageParts;

  // Editor pills (errors / code snippets) round-trip via XML in the user
  // message text. The contract above protects user-typed content; this is
  // structured resource data the user explicitly attached, serialized for
  // round-trip persistence (so the message renders identically when reloaded
  // from the DB). Append after the typed text — never prepend, since the
  // user's prose should still lead the message.
  const editorResourceXml = selectEditorResourceXml(conversationId)(state);
  const textInput = editorResourceXml
    ? rawTextInput
      ? `${rawTextInput}\n\n${editorResourceXml}`
      : editorResourceXml
    : rawTextInput;

  // Resources → ContentBlock[] (editor pills are filtered out by the selector)
  const resourcePayloads = selectResourcePayloads(conversationId)(state);
  // Variables (three-tier resolved — uses instance-owned definitions snapshot)
  const variables = selectResolvedVariables(conversationId)(state);

  // Build user_input
  let user_input: AssembledAgentStartRequest["user_input"];
  if (resourcePayloads.length > 0) {
    const parts: MessagePart[] = [];
    if (textInput) parts.push({ type: "text", text: textInput });
    if (messageParts) parts.push(...messageParts);
    parts.push(...resourcePayloads);
    user_input = parts;
  } else if (messageParts && messageParts.length > 0) {
    const parts: MessagePart[] = [];
    if (textInput) parts.push({ type: "text", text: textInput });
    parts.push(...messageParts);
    user_input = parts;
  } else if (textInput) {
    user_input = textInput;
  }

  // Config overrides (ONLY deltas — uses instance-owned baseSettings snapshot)
  const config_overrides = selectSettingsOverridesForApi(conversationId)(state);

  // Context dict
  const context = selectContextPayload(conversationId)(state);

  // Tool injection (`tools` + `client` envelope) is layered on by the thunk
  // body via `buildToolInjection` after this sync assembly returns. Keeping
  // it out of this pure function lets capability providers stay async (e.g.
  // sandbox-fs mints a short-lived bearer token on demand).

  // Scope — snapshot from appContextSlice at the moment of execution
  const organization_id = selectOrganizationId(state) ?? undefined;
  const project_id = selectProjectId(state) ?? undefined;
  const task_id = selectTaskId(state) ?? undefined;

  // Source tracking
  const { sourceApp, sourceFeature } = instance;

  // Admin-only global flags (read at execute time so the most recent toggle
  // value applies to every outbound turn). Defaults are false on the slice.
  const block_mode = selectIsBlockMode(state);
  const snapshot = selectIsSnapshot(state);

  // Observational Memory — one-shot per-conversation admin signal. When
  // `isMemoryToggleRequested` is true we attach `memory`, `memory_model`,
  // and `memory_scope` to this turn's payload. The server persists the
  // resulting block on `cx_conversation.metadata.observational_memory`, so
  // subsequent turns should NOT re-send unless the admin changes state.
  //
  // The thunk (not assembleRequest) is responsible for clearing the queued
  // toggle after assembling — keeps this selector logic pure.
  const memoryToggleRequested = selectIsMemoryToggleRequested(state);
  const memoryTarget = selectMemoryToggleTarget(state);
  const memoryModel = selectMemoryModel(state);
  const memoryScope = selectMemoryScope(state);

  // Assemble snake_case body
  const request: AssembledAgentStartRequest = { stream: true };

  if (user_input !== undefined) request.user_input = user_input;
  if (Object.keys(variables).length > 0) request.variables = variables;
  if (config_overrides) request.config_overrides = config_overrides;
  if (context) request.context = context;
  if (organization_id) request.organization_id = organization_id;
  if (project_id) request.project_id = project_id;
  if (task_id) request.task_id = task_id;
  if (sourceApp) request.source_app = sourceApp;
  if (sourceFeature) request.source_feature = sourceFeature;
  if (block_mode) request.block_mode = true;
  if (snapshot) request.snapshot = true;
  if (memoryToggleRequested) {
    request.memory = memoryTarget;
    if (memoryTarget) {
      // Only send model/scope on enable — the server needs them to
      // initialize the metadata block. On disable they're ignored.
      if (memoryModel) request.memory_model = memoryModel;
      if (memoryScope) request.memory_scope = memoryScope;
    }
  }

  return request;
}

// =============================================================================
// Execute Thunk
// =============================================================================

interface ExecuteInstanceArgs {
  conversationId: string;
  debug?: boolean;
}

interface ExecuteInstanceResult {
  requestId: string;
  conversationId: string | null;
}

export const executeInstance = createAsyncThunk<
  ExecuteInstanceResult,
  ExecuteInstanceArgs
>(
  "instances/execute",
  async (
    { conversationId, debug = false },
    { getState, dispatch, rejectWithValue },
  ) => {
    const requestId = generateRequestId();

    try {
      const state = getState() as RootState;
      const instance = state.conversations.byConversationId[conversationId];

      if (!instance) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      // Capture the user's input BEFORE assembling (for history + display).
      // Verbatim — never trim/normalize the user's typed text.
      const userInputEntry =
        state.instanceUserInput.byConversationId[conversationId];
      const userMessageParts = userInputEntry?.messageParts ?? undefined;
      // We pull the text from the assembled payload below so the optimistic
      // user message includes any editor-resource XML appended in
      // assembleRequest. Without this, the optimistic bubble would show only
      // the user's raw prose; on reload from the DB the same message would
      // render as prose + chips — a visible mismatch during the first turn.

      // Assemble the request (sync — pure selector logic).
      const payload = assembleRequest(state, conversationId);
      if (!payload) {
        throw new Error(`Failed to assemble request for ${conversationId}`);
      }
      if (debug) payload.debug = true;

      // First-turn-only ambient context. The agent gets `user`,
      // `route_brief`, `organization`, `active_scopes`, etc. once — on the
      // first send of the conversation, merged directly into payload.context.
      // We deliberately do NOT route this through the `instanceContext` slice
      // (which renders chips above every user message). The agent has the
      // keys in its prior turns; re-sending on every turn is noise.
      if (isFirstTurn(state, conversationId)) {
        const ambient = buildAmbientContext(state, conversationId);
        if (ambient) {
          payload.context = { ...(payload.context ?? {}), ...ambient };
        }
      }

      // Layer the unified tool-injection envelope (`tools`, `tools_replace`,
      // `client`) onto the assembled payload. Async because capability
      // providers may need network calls (sandbox token mint).
      const injection = await buildToolInjection(state, conversationId, {
        mode: "additive",
      });
      if (injection.tools) payload.tools = injection.tools;
      if (injection.tools_replace)
        payload.tools_replace = injection.tools_replace;
      if (injection.client) payload.client = injection.client;

      // Promote the sandbox binding to the top-level `sandbox` field. aidream
      // hydrates `ctx.metadata["active_sandbox"]` — the key the matrx-ai
      // fs/shell tools read to route into the container — ONLY from this
      // top-level field. The same payload rides in `client.state["sandbox-fs"]`
      // (for forward-compat + surface declaration), but that lands on a
      // different metadata key the proxy never reads. Until aidream bridges
      // the capability payload to `active_sandbox`, this promotion is what
      // actually makes the agent's tools execute inside the box.
      const sandboxBinding = injection.client?.state?.["sandbox-fs"];
      if (sandboxBinding) payload.sandbox = sandboxBinding;

      // Observational Memory — if we emitted a `memory` signal this turn,
      // (a) optimistically mirror it into the observational-memory slice so
      //     the Creator Panel toggle reflects the change immediately, and
      // (b) clear the queued toggle so it doesn't re-fire on the next turn.
      //     The server persists the authoritative state on
      //     cx_conversation.metadata; we reconcile on bundle reload.
      if (typeof payload.memory === "boolean") {
        dispatch(
          setMemoryEnabledOptimistic({
            conversationId,
            enabled: payload.memory,
            model: payload.memory_model ?? null,
            scope: payload.memory_scope ?? null,
          }),
        );
        dispatch(clearMemoryToggleRequest());
      }

      const variables = payload.variables;

      // Format variables for display in the user message bubble.
      const variableLines = variables
        ? formatVariablesForDisplay(variables)
        : "";

      // Resolve backend channel: per-conversation override (sandbox-mode
      // editor sets this) wins over the global server toggle. The
      // resolver picks the matching auth scheme automatically — Supabase
      // JWT for the global channel, orchestrator-minted bearer for the
      // sandbox proxy.
      const backend = resolveBackendForConversation(state, conversationId);
      if (!backend) {
        throw new Error("No backend URL configured");
      }
      const baseUrl = backend.baseUrl;
      const headers = backend.headers;

      // Multi-turn routing: if there's any prior history (committed turns from a
      // previous send or rehydrated from the database), continue via the
      // /conversations/{id} endpoint. Otherwise start a fresh agent run via
      // /agents/{id}. Captured before the optimistic user turn is added below.
      const isContinuation = selectMessageCount(conversationId)(state) > 0;

      // Ephemeral conversations stream without writing any cx_* rows. The
      // server flag pair `is_new:false, store:false` (see turn-1 routing
      // below) keeps everything stateless. Turn 2+ rides the same
      // `/ai/conversations/{id}` endpoint as a persistent turn — the server
      // honors the same `store:false` semantics.
      const isEphemeral = instance.isEphemeral === true;

      // Add the user's message to history immediately — before the API call fires.
      // Include resource payload parts so they display even before the DB round-trip.
      // The condition covers: typed text, content parts, resources, OR variables.
      const resourceBlocks = Array.isArray(payload.user_input)
        ? payload.user_input.filter((b) => b.type !== "text")
        : [];
      // Pull the assembled text (with editor-resource XML appended) so the
      // optimistic bubble matches what the DB will serve back.
      const assembledUserText = Array.isArray(payload.user_input)
        ? ((
            payload.user_input.find((b) => b.type === "text") as
              | (MessagePart & { text?: string })
              | undefined
          )?.text ?? "")
        : typeof payload.user_input === "string"
          ? payload.user_input
          : "";

      const displayContent = [variableLines, assembledUserText]
        .filter(Boolean)
        .join("\n");

      let userMessageClientTempId: string | undefined;
      if (displayContent || userMessageParts || resourceBlocks.length > 0) {
        // Optimistically push the user's message into messages.byId under a
        // client-generated UUID. When `record_reserved cx_message role=user`
        // lands on the stream, process-stream promotes this temp id to the
        // real server `cx_message.id` — one Redux record, no duplicates.
        const content: MessagePart[] = [];
        if (displayContent) {
          content.push({ type: "text", text: displayContent });
        }
        if (userMessageParts) content.push(...userMessageParts);
        content.push(...resourceBlocks);
        userMessageClientTempId = uuidv4();
        const nextPosition = selectMessageCount(conversationId)(
          getState() as RootState,
        );
        dispatch(
          addOptimisticUserMessage({
            conversationId,
            clientTempId: userMessageClientTempId,
            content,
            position: nextPosition,
          }),
        );
      }

      // Create the request tracking entry
      dispatch(createRequest({ requestId, conversationId }));
      dispatch(setInstanceStatus({ conversationId, status: "running" }));
      dispatch(setRequestStatus({ requestId, status: "connecting" }));

      let url: string;
      let routedPayload: Record<string, unknown>;

      // Ephemeral turn 2+ was handled via the early short-circuit above.
      // Here we only need to inject `is_new:false, store:false` into the
      // turn-1 agent payload when ephemeral — the server then streams
      // without writing any cx_* rows. See the endpoint routing table in
      // `features/agents/types/conversation-invocation.types.ts`.

      // Consume any pending cache-bypass flags for this conversation. If
      // the user edited / forked / deleted a message directly on the DB
      // since the last outbound call, this ships `cache_bypass` so the
      // server's agent cache rebuilds from the authoritative DB state.
      // One-shot: the flags are cleared inside the consumer.
      const { consumePendingCacheBypass } =
        await import("../message-crud/cache-bypass.slice");
      const pendingBypass = dispatch(
        consumePendingCacheBypass(conversationId) as never,
      ) as unknown as
        | import("../message-crud/cache-bypass.slice").CacheBypassFlags
        | null;

      if (isContinuation) {
        // Turn 2+: POST /ai/conversations/{conversationId}
        url = `${baseUrl}/ai/conversations/${conversationId}`;
        // Continuation only needs user_input, config_overrides, context,
        // tools, client, stream. Admin flags (block_mode, snapshot) are
        // forwarded so each turn honors the latest toggle value, not just
        // turn 1. `tools` / `tools_replace` / `client` come from
        // buildToolInjection above.
        routedPayload = {
          user_input: payload.user_input,
          stream: true,
          ...(payload.config_overrides && {
            config_overrides: payload.config_overrides,
          }),
          ...(payload.context && { context: payload.context }),
          ...(payload.tools && { tools: payload.tools }),
          ...(payload.tools_replace !== undefined && {
            tools_replace: payload.tools_replace,
          }),
          ...(payload.client && { client: payload.client }),
          ...(payload.sandbox && { sandbox: payload.sandbox }),
          ...(debug && { debug: true }),
          ...(payload.block_mode && { block_mode: true }),
          ...(payload.snapshot && { snapshot: true }),
          ...(typeof payload.memory === "boolean" && {
            memory: payload.memory,
          }),
          ...(payload.memory_model && { memory_model: payload.memory_model }),
          ...(payload.memory_scope && { memory_scope: payload.memory_scope }),
          ...(pendingBypass && { cache_bypass: pendingBypass }),
          ...(isEphemeral && { store: false }),
        };
      } else {
        // Turn 1: POST /ai/agents/{id}
        //
        // Agent-vs-version routing: when the instance was launched from a
        // version-pinned shortcut/app (`initialAgentVersionId` set), we
        // target the frozen version row instead of the live agent. The
        // server uses the same endpoint with `is_version: true` to read
        // from `agx_version`.
        //
        // Persistent → is_new:true (server creates the cx_conversation row).
        // Ephemeral → is_new:false, store:false (server streams without writing).
        const pinnedVersionId = instance.initialAgentVersionId ?? null;
        const targetId = pinnedVersionId ?? instance.agentId;
        url = `${baseUrl}/ai/agents/${targetId}`;
        routedPayload = {
          ...payload,
          conversation_id: conversationId,
          is_new: !isEphemeral,
          ...(pinnedVersionId && { is_version: true }),
          ...(isEphemeral && { store: false }),
          ...(pendingBypass && { cache_bypass: pendingBypass }),
        } as Record<string, unknown>;
      }

      // Record the true submit moment — this is t=0 for all client timing.
      const submitAt = performance.now();

      // Fire the API call
      const abortController = new AbortController();
      registerAbortController(conversationId, abortController);
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(routedPayload),
        signal: abortController.signal,
      });

      if (!response.ok) {
        let serverMessage = `${response.status} ${response.statusText}`;
        try {
          const body = await response.json();
          serverMessage =
            body?.detail?.message ?? body?.detail ?? serverMessage;
        } catch {
          /* non-JSON error body */
        }

        const code = response.status;
        if (code === 409) {
          throw new Error(`Conversation already exists: ${serverMessage}`);
        } else if (code === 404) {
          throw new Error(`Conversation not found: ${serverMessage}`);
        } else if (code === 422) {
          // 422 covers two distinct shapes from the backend:
          //   • Tool injection errors — capability resolution failed,
          //     unknown capability, ToolMergeError. Message starts with
          //     "client capability" or "tool". Surface as toast so the
          //     user sees what actually broke instead of a generic banner.
          //   • Validation errors — bad conversation id, schema mismatch.
          //     Throw as before.
          const lower =
            typeof serverMessage === "string"
              ? serverMessage.toLowerCase()
              : "";
          if (
            lower.startsWith("client capability") ||
            lower.includes("toolmergeerror") ||
            lower.includes("conflicting tool") ||
            (lower.includes("tool") &&
              (lower.includes("merge") || lower.includes("capability")))
          ) {
            toast.error("Tool injection failed", {
              description: serverMessage,
            });
            throw new Error(`Tool injection failed: ${serverMessage}`);
          }
          throw new Error(`Invalid conversation ID: ${serverMessage}`);
        }
        throw new Error(`API error: ${serverMessage}`);
      }

      const headerConversationId = response.headers.get("X-Conversation-ID");
      assertConversationIdMatches(
        conversationId,
        headerConversationId,
        "x-conversation-id-header",
      );
      const conversationIdAt = headerConversationId ? performance.now() : null;

      dispatch(setInstanceStatus({ conversationId, status: "streaming" }));
      dispatch(setRequestStatus({ requestId, status: "streaming" }));

      const currentUiState = (getState() as RootState).instanceUIState
        ?.byConversationId[conversationId];

      await processStream({
        requestId,
        conversationId,
        response,
        submitAt,
        conversationIdAt,
        dispatch,
        getState: getState as () => RootState,
        jsonExtraction: currentUiState?.jsonExtraction ?? undefined,
        userMessageClientTempId,
      });

      unregisterAbortController(conversationId);
      return {
        requestId,
        conversationId,
      };
    } catch (error) {
      unregisterAbortController(conversationId);

      if (error instanceof Error && error.name === "AbortError") {
        dispatch(setInstanceStatus({ conversationId, status: "cancelled" }));
        return rejectWithValue("Cancelled");
      }

      // Client-side error (network failure, abort, etc.) — synthesise the
      // backend's ErrorPayload shape so all error consumers see one canonical
      // structure regardless of source. error_type=client_error makes the
      // origin clear.
      const message = error instanceof Error ? error.message : "Unknown error";
      dispatch(
        setRequestStatus({
          requestId,
          status: "error",
          error: { error_type: "client_error", message },
        }),
      );
      dispatch(setInstanceStatus({ conversationId, status: "error" }));

      return rejectWithValue(
        error instanceof Error ? error.message : "Execution failed",
      );
    }
  },
);

// =============================================================================
// Clear After Send
// =============================================================================

/**
 * Atomically clears all input state after a successful send.
 * Clears user text input, content parts, and all attached resources.
 * Call this after executeInstance resolves — keeps the instance alive
 * for follow-up turns while returning the input area to a clean state.
 */
export const clearAfterSend = createAsyncThunk<void, string>(
  "instances/clearAfterSend",
  async (conversationId, { dispatch }) => {
    const { clearUserInput } =
      await import("../instance-user-input/instance-user-input.slice");
    const { clearAllResources } =
      await import("../instance-resources/instance-resources.slice");

    dispatch(clearUserInput(conversationId));
    dispatch(clearAllResources(conversationId));
  },
);

// =============================================================================
// Submit Tool Results
// =============================================================================

interface SubmitToolResultsArgs {
  requestId: string;
  results: Array<{
    callId: string;
    toolName: string;
    output?: unknown;
    isError?: boolean;
    errorMessage?: string;
  }>;
}

export const submitToolResults = createAsyncThunk<void, SubmitToolResultsArgs>(
  "instances/submitToolResults",
  async ({ requestId, results }, { getState, dispatch, rejectWithValue }) => {
    try {
      const state = getState() as RootState;
      const request = state.activeRequests.byRequestId[requestId];
      if (!request?.conversationId) {
        throw new Error("No conversation ID for tool result submission");
      }

      // Tool results MUST hit the same server that owns the conversation
      // (otherwise the run is orphaned), so use the conversation-aware
      // resolver here too — including the matching auth scheme.
      const backend = resolveBackendForConversation(
        state,
        request.conversationId,
      );
      if (!backend) throw new Error("No backend URL configured");
      const baseUrl = backend.baseUrl;
      const headers = backend.headers;

      // Map camelCase internal state to snake_case wire format
      const wireResults = results.map((r) => ({
        call_id: r.callId,
        tool_name: r.toolName,
        output: r.output,
        is_error: r.isError ?? false,
        error_message: r.errorMessage ?? null,
      }));

      const response = await fetch(
        `${baseUrl}/ai/conversations/${request.conversationId}/tool_results`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ results: wireResults }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Tool results submission failed: ${response.statusText}`,
        );
      }

      // Mark tool calls as resolved
      const { resolveToolCall } =
        await import("../active-requests/active-requests.slice");
      for (const result of results) {
        dispatch(resolveToolCall({ requestId, callId: result.callId }));
      }
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to submit tool results",
      );
    }
  },
);
