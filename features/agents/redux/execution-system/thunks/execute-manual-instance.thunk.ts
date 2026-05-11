/**
 * Execute Manual Instance Thunk
 *
 * The Agent Builder's execution path — always POSTs /ai/manual with the full
 * agent definition read FRESH from Redux at submit time. Nothing on the server
 * looks up the agent record; every field that affects the model call rides
 * inside the request body. This is what lets the Builder compare models and
 * settings without saving, and why the path MUST NEVER hit /ai/agents or
 * /ai/conversations.
 *
 * Contract (do not regress):
 *   1. Reads the LIVE agent definition (`state.agentDefinition.agents[agentId]`)
 *      — picks up unsaved dirty edits to modelId, messages, tools, etc.
 *   2. Builds `messages[]` as: agent priming messages + prior committed turns
 *      from the messages slice + the new user input. Multi-turn behavior lives
 *      entirely client-side.
 *   3. Spreads LLM params FLAT at the top level of the request — never as
 *      `config_overrides`. There is no override delta layer for manual mode;
 *      the `instance-model-overrides` slice is not touched by this path.
 *   4. Mints a FRESH `conversation_id` (uuid) per call and always sends
 *      `is_new: true`. The Redux-side `conversationId` stays stable for UI
 *      continuity but never travels on the wire as the same value twice.
 *   5. Always POSTs `${baseUrl}${ENDPOINTS.ai.manual}` (`/ai/manual`). A dev
 *      guard throws if the URL ever drifts.
 *   6. Imports nothing from execute-instance.thunk.ts. Shares only transport
 *      plumbing (processStream, backend resolution, optimistic message helpers).
 *
 * History: this thunk was deleted in commit 5bcb43380 (the May 2026 tool-
 * injection migration), which rerouted every caller through executeInstance.
 * That broke the Builder silently — every submit started reading the saved
 * agent record server-side instead of the live UI. Restored as
 * `executeManualInstance` per the rename tracked in
 * features/agents/audits/04-legacy-obliteration-plan.md.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import type { RootState } from "@/lib/redux/store";
import type {
  ChatRequestPayload,
  SystemInstruction,
} from "@/features/agents/types/agent-api-types";
import type { MessagePart } from "@/types/python-generated/stream-events";
import type { MessageRecord } from "../messages/messages.slice";
import {
  extractContentBlocks,
  extractFlatText,
  selectMessageCount,
} from "../messages/messages.selectors";
import { generateRequestId } from "../utils/ids";
import { setInstanceStatus } from "../conversations/conversations.slice";
import { selectResolvedVariables } from "../instance-variable-values/instance-variable-values.selectors";
import { selectContextPayload } from "../instance-context/instance-context.selectors";
import { selectResourcePayloads } from "../instance-resources/instance-resources.selectors";
import { resolveBackendForConversation } from "./resolve-base-url";
import {
  createRequest,
  setRequestStatus,
} from "../active-requests/active-requests.slice";
import { addOptimisticUserMessage } from "../messages/messages.slice";
import { processStream } from "./process-stream";
import { ENDPOINTS } from "@/lib/api/endpoints";
import {
  registerAbortController,
  unregisterAbortController,
} from "./abort-registry";
import { assertConversationIdMatches } from "../utils/assert-conversation-id";
import { callbackManager } from "@/utils/callbackManager";
import {
  deriveClientToolsFromHandle,
  isWidgetActionName,
  type WidgetHandle,
} from "@/features/agents/types/widget-handle.types";
import {
  selectIsBlockMode,
  selectIsMemoryToggleRequested,
  selectIsSnapshot,
  selectMemoryModel,
  selectMemoryScope,
  selectMemoryToggleTarget,
  selectWidgetHandleIdFor,
} from "../instance-ui-state/instance-ui-state.selectors";
import { clearMemoryToggleRequest } from "../instance-ui-state/instance-ui-state.slice";
import { setMemoryEnabledOptimistic } from "../observational-memory/observational-memory.slice";
import { toast } from "sonner";

// UI-only capability flags carried inside `agent.settings` for the builder's
// model picker (e.g. `tools: { allowed: true }`, `image_urls: true`). They
// must not be forwarded to the model call — the actual tool list ships via
// `request.tools` (from agent.tools). Mirrors the set used by the agent-mode
// override selector but copied locally so this path takes zero dependency on
// instance-model-overrides.
const UI_CAPABILITY_KEYS = new Set<string>([
  "tools",
  "image_urls",
  "file_urls",
  "youtube_videos",
  "multi_speaker",
]);

function stripUiCapabilityFlags(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (UI_CAPABILITY_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

// =============================================================================
// Turn Conversion Utilities
// =============================================================================

/**
 * Converts `MessageRecord[]` to the wire format the chat endpoint expects.
 * Each record becomes `{ role, content }` where content is a `MessagePart[]`.
 * Falls back to a single text block synthesised from flat text when a record
 * has no structured blocks yet (e.g. an optimistic user message that hasn't
 * been promoted to the server cx_message id).
 */
function recordsToMessages(
  records: MessageRecord[],
): Array<{ role: string; content: unknown }> {
  return records.map((record) => {
    const blocks = extractContentBlocks(record);
    if (blocks.length > 0) {
      return { role: record.role, content: blocks };
    }
    const text = extractFlatText(record);
    return {
      role: record.role,
      content: [{ type: "text", text }],
    };
  });
}

/**
 * Extracts plain text from a system message's content field. Agent definition
 * messages store content as an array of content parts; this flattens them
 * into a single string for the structured `system_instruction` builder.
 */
function extractSystemText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block)
          return String((block as Record<string, unknown>).text ?? "");
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

// =============================================================================
// Assemble Manual Request
// =============================================================================

/**
 * Builds the `/ai/manual` payload by reading FRESH from all Redux sources.
 *
 * No snapshotting. No override slice. No conversation continuation. Every call
 * is independent on the wire; multi-turn UI state accumulates client-side
 * through the messages slice.
 */
export function assembleManualRequest(
  state: RootState,
  conversationId: string,
): Partial<ChatRequestPayload> | null {
  const instance = state.conversations.byConversationId[conversationId];
  if (!instance) return null;

  const preExecState = state.instanceUIState.byConversationId[conversationId];
  if (
    preExecState?.showPreExecutionGate &&
    !preExecState.preExecutionSatisfied
  ) {
    console.error(
      `[assembleManualRequest] BLOCKED: instance ${conversationId} requires pre-execution input that has not been satisfied.`,
    );
    return null;
  }

  // Source: live agent definition. Honor version pinning when the instance
  // was launched against a frozen version row.
  const sourceId = instance.initialAgentVersionId ?? instance.agentId;
  const agent = state.agentDefinition.agents?.[sourceId];
  if (!agent) return null;

  const ai_model_id = agent.modelId;
  if (!ai_model_id) return null;

  const uiState = state.instanceUIState.byConversationId[conversationId];
  const advancedSettings = uiState?.builderAdvancedSettings;
  const useStructured =
    advancedSettings?.useStructuredSystemInstruction ?? false;

  // ── messages[] = priming + history + current user turn ───────────────────
  const messages: Array<{ role: string; content: unknown }> = [];
  let structuredSystemInstruction: SystemInstruction | undefined;

  if (agent.messages && agent.messages.length > 0) {
    for (const msg of agent.messages) {
      if (useStructured && msg.role === "system") {
        const textContent = extractSystemText(msg.content);
        const userOverrides = advancedSettings?.structuredInstruction ?? {};
        structuredSystemInstruction = {
          content: textContent,
          include_date: true,
          ...userOverrides,
        };
      } else {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  const messagesEntry = state.messages.byConversationId[conversationId];
  if (messagesEntry) {
    const orderedRecords: MessageRecord[] = [];
    for (const id of messagesEntry.orderedIds) {
      const record = messagesEntry.byId[id];
      if (record && record.role !== "system") orderedRecords.push(record);
    }
    if (orderedRecords.length > 0) {
      messages.push(...recordsToMessages(orderedRecords));
    }
  }

  // Current user input. Verbatim — whitespace is meaningful (fenced code,
  // indented markdown, deliberate blank lines).
  const userInputState =
    state.instanceUserInput.byConversationId[conversationId];
  const textInput = userInputState?.text ?? "";
  const userMessageParts = userInputState?.messageParts;
  const resourcePayloads = selectResourcePayloads(conversationId)(state);

  if (textInput || userMessageParts || resourcePayloads.length > 0) {
    const parts: MessagePart[] = [];
    if (textInput) parts.push({ type: "text", text: textInput });
    if (userMessageParts) parts.push(...userMessageParts);
    if (resourcePayloads.length > 0) parts.push(...resourcePayloads);
    messages.push({ role: "user", content: parts });
  }

  // ── LLM params: read agent.settings DIRECTLY (no override slice) ─────────
  // Strip UI-only capability flags before spreading flat at the top level.
  const fullSettings = stripUiCapabilityFlags(
    (agent.settings ?? {}) as Record<string, unknown>,
  );

  const variables = selectResolvedVariables(conversationId)(state);
  const context = selectContextPayload(conversationId)(state);

  // `agent.tools` stores tool registry UUIDs (string[]). The wire shape is
  // a discriminated union — wrap each UUID as a `RegisteredToolSpec`. The
  // server reads `tool_id` first (UUID lookup) and falls back to `name`,
  // so passing the UUID in both fields is safe and unambiguous.
  const tools =
    agent.tools && agent.tools.length > 0
      ? (agent.tools.map((uuid) => ({
          kind: "registered" as const,
          name: uuid,
          tool_id: uuid,
          delegate: false,
        })) as ChatRequestPayload["tools"])
      : undefined;
  const custom_tools =
    agent.customTools && agent.customTools.length > 0
      ? (agent.customTools as unknown as Array<Record<string, unknown>>)
      : undefined;
  const mcp_servers =
    agent.mcpServers && agent.mcpServers.length > 0
      ? agent.mcpServers
      : undefined;

  // Client tools — non-widget tool names from the slice + tools the widget
  // handle exposes. Same derivation as the agent path.
  const nonWidgetClientTools = (
    state.instanceClientTools.byConversationId[conversationId] ?? []
  ).filter((name) => !isWidgetActionName(name));
  const widgetHandleId = selectWidgetHandleIdFor(state, conversationId);
  const widgetHandle = widgetHandleId
    ? callbackManager.get<WidgetHandle>(widgetHandleId)
    : null;
  const widgetClientTools = deriveClientToolsFromHandle(widgetHandle);
  const mergedClientTools = [...nonWidgetClientTools, ...widgetClientTools];
  const client_tools =
    mergedClientTools.length > 0 ? mergedClientTools : undefined;

  const { sourceApp, sourceFeature } = instance;
  const isEphemeral = instance.isEphemeral === true;

  // Fresh wire-level conversation_id every call. Multi-turn history lives in
  // `messages[]` (client-side). Each POST is independent on the server.
  const wireConversationId = uuidv4();

  const request: Partial<ChatRequestPayload> = {
    ai_model_id,
    messages: messages as ChatRequestPayload["messages"],
    stream: true,
    store: isEphemeral ? false : (advancedSettings?.store ?? true),
    debug: advancedSettings?.debug ?? false,
    max_iterations: advancedSettings?.maxIterations ?? 100,
    max_retries_per_iteration: advancedSettings?.maxRetriesPerIteration ?? 2,
    is_new: true,
    conversation_id: wireConversationId,
    ...(fullSettings as Partial<ChatRequestPayload>),
  };

  if (Object.keys(variables).length > 0) {
    request.variables = variables as Record<string, unknown>;
  }
  if (context) request.context = context;
  if (tools) request.tools = tools as ChatRequestPayload["tools"];
  if (custom_tools)
    request.custom_tools = custom_tools as ChatRequestPayload["custom_tools"];
  if (mcp_servers) request.mcp_servers = mcp_servers;
  if (client_tools)
    request.client_tools = client_tools as ChatRequestPayload["client_tools"];
  if (structuredSystemInstruction) {
    // OpenAPI types system_instruction as string, but the server's
    // SystemInstruction.from_dict accepts the structured object too.
    request.system_instruction =
      structuredSystemInstruction as unknown as string;
  }
  if (sourceApp) request.source_app = sourceApp;
  if (sourceFeature) request.source_feature = sourceFeature;

  // Admin-only global flags — read at execute time so the latest toggle
  // value applies to every outbound manual call.
  if (selectIsBlockMode(state)) request.block_mode = true;
  if (selectIsSnapshot(state)) request.snapshot = true;

  // Observational Memory — one-shot per-conversation toggle. Same semantics
  // as the agent path: emit only when the admin explicitly requested a toggle
  // this turn; the executing thunk clears the queued flag after assembly.
  if (selectIsMemoryToggleRequested(state)) {
    const target = selectMemoryToggleTarget(state);
    request.memory = target;
    if (target) {
      const memoryModel = selectMemoryModel(state);
      const memoryScope = selectMemoryScope(state);
      if (memoryModel) request.memory_model = memoryModel;
      if (memoryScope) request.memory_scope = memoryScope;
    }
  }

  // Stable agx_agent.id for server-side logging / linkage. Version snapshots
  // point at their parent agent for cross-reference; live agents use their
  // own id.
  request.agent_id = agent.parentAgentId ?? agent.id;
  request.is_version = agent.isVersion;

  return request;
}

// =============================================================================
// Execute Manual Instance Thunk
// =============================================================================

interface ExecuteManualInstanceArgs {
  conversationId: string;
  debug?: boolean;
}

interface ExecuteManualInstanceResult {
  requestId: string;
  conversationId: string | null;
}

export const executeManualInstance = createAsyncThunk<
  ExecuteManualInstanceResult,
  ExecuteManualInstanceArgs
>(
  "instances/executeManual",
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

      const userInputEntry =
        state.instanceUserInput.byConversationId[conversationId];
      const userInputText = userInputEntry?.text ?? "";
      const userMessageParts = userInputEntry?.messageParts ?? undefined;

      const payload = assembleManualRequest(state, conversationId);
      if (!payload) {
        throw new Error(
          `Failed to assemble manual request for ${conversationId}. ` +
            `Check that the agent has a modelId set.`,
        );
      }
      if (debug) payload.debug = true;

      // Mirror an emitted memory toggle into the slice + clear the one-shot
      // queue so the next turn doesn't re-fire.
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

      const backend = resolveBackendForConversation(state, conversationId);
      if (!backend) throw new Error("No backend URL configured");
      const baseUrl = backend.baseUrl;
      const headers = backend.headers;

      // Optimistic user message — push to messages.byId before the API call
      // so the user sees their bubble immediately. When the server reserves
      // the cx_message row, processStream promotes this temp id to the real
      // server message id.
      const resourcePayloads = selectResourcePayloads(conversationId)(state);
      const resourceBlocks = resourcePayloads.filter((b) => b.type !== "text");
      let userMessageClientTempId: string | undefined;
      if (userInputText || userMessageParts || resourceBlocks.length > 0) {
        const content: MessagePart[] = [];
        if (userInputText) content.push({ type: "text", text: userInputText });
        if (userMessageParts) content.push(...userMessageParts);
        if (resourceBlocks.length > 0) content.push(...resourceBlocks);
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

      dispatch(createRequest({ requestId, conversationId }));
      dispatch(setInstanceStatus({ conversationId, status: "running" }));
      dispatch(setRequestStatus({ requestId, status: "connecting" }));

      const url = `${baseUrl}${ENDPOINTS.ai.manual}`;

      // Dev-mode hard guard. This path CANNOT EVER hit an agent endpoint —
      // the whole point of /ai/manual is to send the live agent definition
      // and bypass server-side caching. If a future refactor accidentally
      // rewires this URL or drops the ai_model_id, fail loudly the first
      // time anyone touches the Builder in dev.
      if (process.env.NODE_ENV !== "production") {
        if (!url.endsWith("/ai/manual")) {
          throw new Error(
            `[ManualExec] Forbidden URL "${url}". The manual execution path ` +
              `must hit /ai/manual only — never /ai/agents/* or ` +
              `/ai/conversations/*. Check ENDPOINTS.ai.manual.`,
          );
        }
        if (!payload.ai_model_id) {
          throw new Error(
            `[ManualExec] Refusing to send manual request without ` +
              `ai_model_id (agent=${instance.agentId}).`,
          );
        }
      }

      const submitAt = performance.now();
      const abortController = new AbortController();
      registerAbortController(conversationId, abortController);

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
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
        if (code === 422) {
          // Tool injection failures from the backend surface as 422 with a
          // descriptive message — bubble through as a toast so the user
          // sees what actually broke instead of a generic error banner.
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
          throw new Error(`Invalid manual request: ${serverMessage}`);
        }
        throw new Error(`API error: ${serverMessage}`);
      }

      const headerConversationId = response.headers.get("X-Conversation-ID");
      if (headerConversationId) {
        // Server echoed the wire conversation_id — confirm it matches what
        // we sent. If /ai/manual does not echo this header, the assertion
        // is skipped (no header → noop).
        assertConversationIdMatches(
          conversationId,
          headerConversationId,
          "x-conversation-id-header",
        );
      }
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
      return { requestId, conversationId };
    } catch (error) {
      unregisterAbortController(conversationId);

      if (error instanceof Error && error.name === "AbortError") {
        dispatch(setInstanceStatus({ conversationId, status: "cancelled" }));
        return rejectWithValue("Cancelled");
      }

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
        error instanceof Error ? error.message : "Manual execution failed",
      );
    }
  },
);
