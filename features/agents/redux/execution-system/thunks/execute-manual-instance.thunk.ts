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
 *   4. Omits `conversation_id` (server mints + echoes its own). Sends
 *      `is_new: true` every call. The Redux conversationId stays stable for
 *      UI continuity; stream events are remapped to it.
 *   5. Always POSTs `${baseUrl}${ENDPOINTS.ai.manual}` (`/ai/manual`). A dev
 *      guard throws if the URL ever drifts.
 *   6. Imports nothing from execute-instance.thunk.ts. Shares only transport
 *      plumbing (processStream, backend resolution, optimistic message,
 *      resilient-fetch, payload-recovery, net-requests, toNetError).
 *
 * Observability — non-negotiable for the Builder:
 *   - resilientFetch enforces a 15s connect timeout and surfaces typed
 *     NetErrors so the catch block emits an `error.code` ("connect-timeout",
 *     "heartbeat-timeout", etc.) the UI's retry/health badges read.
 *   - processStream runs with a 30s heartbeat watchdog + 10-minute lifetime
 *     ceiling so a wedged stream aborts cleanly instead of hanging the UI.
 *   - The global `netRequests` slice is fed start → streaming → completed /
 *     timed-out / error so RequestRecoveryProvider and the Creator Panel
 *     see every manual run with per-event heartbeats, phases, and codes.
 *   - `payloadSafetyStore` persists the outbound payload to IndexedDB before
 *     the network call so a tab-close / server-never-responds round-trip
 *     surfaces on the next page load via the recovery UI.
 *
 * Tool wire shape — per TOOL_ROUTING_RULES.md (canonical) and
 * matrx-ai/tools/specs.py:
 *   - All tool fields funnel through `buildToolInjection({mode: "replace"})`
 *     so the manual path stays in lockstep with executeInstance's shape.
 *     Seed the function with the agent's saved tools and customTools and it
 *     returns `{tools_replace, client}`.
 *   - `agent.tools` (UUID array) → `RegisteredToolSpec` seeds without a
 *     hardcoded `delegate` (the server's auto_delegate flips it when the
 *     active client surface owns a delegated handler for the tool).
 *   - `agent.customTools` → `InlineToolSpec` seeds (server treats inline
 *     specs as always client-delegated).
 *   - `agent.mcpServers` (slug list) → `client.mcp` per §10. The server
 *     unions it with any MCPs the agent definition already carries.
 *   - Per-instance client tool names (widget + slice) ride through
 *     `buildToolInjection`'s built-in client-tool path as
 *     `RegisteredToolSpec` with `delegate=true`.
 *   - The active capability providers (editor-state, sandbox-fs) populate
 *     the `client.capabilities` envelope. UI-first tools (user / update_plan
 *     / …) come from the request's surface (e.g. matrx-user/chat) resolved
 *     server-side via tool_resolve_for_request — not shipped by name here.
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
import { isSyntheticAgentId } from "@/features/agents/redux/agent-definition/synthetic-id";
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
import { resolveAgentSandboxRef } from "@/lib/sandbox/active-binding";
import { selectActiveServer } from "@/lib/redux/slices/apiConfigSlice";
import {
  createRequest,
  setRequestStatus,
  setRequestRouting,
} from "../active-requests/active-requests.slice";
import { addOptimisticUserMessage } from "../messages/messages.slice";
import { processStream } from "./process-stream";
import { ENDPOINTS } from "@/lib/api/endpoints";
import {
  registerAbortController,
  unregisterAbortController,
} from "./abort-registry";
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
import { toast } from "sonner";
import { resilientFetch } from "@/lib/net/resilient-fetch";
import { toNetError } from "@/lib/net/errors";
import { payloadSafetyStore } from "@/lib/persistence/payloadSafetyStore";
import {
  startRequest as startNetRequest,
  setPhase as setNetPhase,
  beatHeartbeat as beatNetHeartbeat,
  finishRequest as finishNetRequest,
} from "@/lib/redux/net/netRequestsSlice";
import { buildToolInjection } from "../utils/build-tool-injection";
import type { ToolSpec } from "@/features/agents/types/tool-injection.types";

// UI-only capability flags carried inside `agent.settings` for the builder's
// model picker (e.g. `tools: { allowed: true }`, `image_urls: true`). They
// must not be forwarded to the model call — the actual tool list ships via
// the tool fields below. Copied locally so this path takes zero dependency
// on instance-model-overrides.
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

// Stream watchdog defaults — match the historical pre-regression values so
// Builder runs have the same connection-health guarantees as agent runs.
const CONNECT_TIMEOUT_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;
const MAX_LIFETIME_MS = 600_000;

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
export async function assembleManualRequest(
  state: RootState,
  conversationId: string,
): Promise<Partial<ChatRequestPayload> | null> {
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
  const fullSettings = stripUiCapabilityFlags(
    (agent.settings ?? {}) as Record<string, unknown>,
  );

  const variables = selectResolvedVariables(conversationId)(state);
  const context = selectContextPayload(conversationId)(state);

  // ── Tool wire shape — unified through buildToolInjection ────────────────
  // agent.tools (UUID array) becomes seed RegisteredToolSpec entries with
  // tool_id set so the server's resolved_tool_id() rebinds them through the
  // registry. delegate is left at the default (false) — the server's
  // auto_delegate logic flips it when the active client surface owns a
  // delegated handler for the tool. The UI-first tools come from the
  // request's surface (e.g. matrx-user/chat) via the DB surface resolver.
  //
  // agent.customTools become InlineToolSpec seed entries — same shape as
  // CustomToolDefinition (name + description + input_schema).
  //
  // Widget + per-instance client tools ride through buildToolInjection's
  // built-in client-tool path (RegisteredToolSpec with delegate=true).
  const seedFromAgent: ToolSpec[] = [];
  if (agent.tools) {
    for (const uuid of agent.tools) {
      seedFromAgent.push({
        kind: "registered",
        name: uuid,
        tool_id: uuid,
        delegate: false,
      });
    }
  }
  if (agent.customTools) {
    for (const ct of agent.customTools) {
      seedFromAgent.push({
        kind: "inline",
        name: ct.name,
        description: ct.description ?? "",
        input_schema: ct.input_schema ?? {
          type: "object",
          properties: {},
          required: [],
        },
      });
    }
  }

  const injection = await buildToolInjection(state, conversationId, {
    mode: "replace",
    seedTools: seedFromAgent,
  });

  // agent.mcpServers (slug list) → client.mcp per TOOL_ROUTING_RULES.md §10.
  // Server merges into config.mcp_servers without disturbing whatever the
  // agent definition already carries.
  if (agent.mcpServers && agent.mcpServers.length > 0) {
    injection.client = {
      ...(injection.client ?? { capabilities: [], state: {} }),
      mcp: agent.mcpServers,
    };
  }

  const { sourceApp, sourceFeature } = instance;
  const isEphemeral = instance.isEphemeral === true;

  // We do NOT send a wire `conversation_id`. The server mints a fresh one
  // and echoes it via X-Conversation-ID / typed `conversation_id` events.
  // Sending a client-minted UUID with `is_new: true` collides with server-
  // side cx_conversation rows. Multi-turn history is carried entirely
  // client-side in messages[]; stream events carry the server's id and are
  // remapped to the local Redux conversationId via processStream's
  // forceLocalConversationId flag.
  const request: Partial<ChatRequestPayload> = {
    ai_model_id,
    messages: messages as ChatRequestPayload["messages"],
    stream: true,
    store: isEphemeral ? false : (advancedSettings?.store ?? true),
    debug: advancedSettings?.debug ?? false,
    max_iterations: advancedSettings?.maxIterations ?? 100,
    max_retries_per_iteration: advancedSettings?.maxRetriesPerIteration ?? 2,
    is_new: true,
    ...(fullSettings as Partial<ChatRequestPayload>),
  };

  if (Object.keys(variables).length > 0) {
    request.variables = variables as Record<string, unknown>;
  }
  if (context) request.context = context;
  if (injection.tools_replace)
    request.tools_replace =
      injection.tools_replace as ChatRequestPayload["tools_replace"];
  if (injection.client)
    request.client = injection.client as ChatRequestPayload["client"];
  // Promote the sandbox binding to the top-level `sandbox` field — aidream
  // reads `ctx.metadata["active_sandbox"]` (the key the fs/shell tools route
  // on) only from here, not from `client.state["sandbox-fs"]`. See the same
  // promotion in execute-instance.thunk.ts.
  {
    const sandboxBinding = injection.client?.state?.["sandbox-fs"];
    if (sandboxBinding)
      request.sandbox = sandboxBinding as ChatRequestPayload["sandbox"];
  }
  if (structuredSystemInstruction) {
    request.system_instruction =
      structuredSystemInstruction as unknown as string;
  }
  if (sourceApp) request.source_app = sourceApp;
  if (sourceFeature) request.source_feature = sourceFeature;

  if (selectIsBlockMode(state)) request.block_mode = true;
  if (selectIsSnapshot(state)) request.snapshot = true;

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
  //
  // CRITICAL: synthetic comparison/variation agents (`cmp-` ids) are NOT
  // real DB rows — NEVER send their id to the server. Anything expecting a
  // uuid (logging, FK joins, validators) crashes on the `cmp-` prefix. Omit
  // both fields entirely so the server treats the request as ephemeral.
  // Forking sets `parentAgentId = null` so we can't use that as a substitute
  // either — drop the linkage altogether for synthetics.
  if (!isSyntheticAgentId(agent.id)) {
    request.agent_id = agent.parentAgentId ?? agent.id;
    request.is_version = agent.isVersion;
  }

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
    let recoveryId: string | null = null;

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

      const payload = await assembleManualRequest(state, conversationId);
      if (!payload) {
        throw new Error(
          `Failed to assemble manual request for ${conversationId}. ` +
            `Check that the agent has a modelId set.`,
        );
      }
      if (debug) payload.debug = true;

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

      // Optimistic user message — push BEFORE the network call so the bubble
      // appears immediately and the response column has something to render
      // even on slow / failing networks.
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

      // Global net-requests slice. The Creator Panel and RequestRecoveryProvider
      // read this — without it, manual runs are invisible in the connection-
      // health UI. label/groupKey tagging matches the agent path.
      dispatch(
        startNetRequest({
          id: requestId,
          kind: "agent-run",
          label: `Manual: ${instance.agentId}`,
          groupKey: conversationId,
        }),
      );

      const url = `${baseUrl}${ENDPOINTS.ai.manual}`;

      // Factual routing record — see execute-instance.thunk for the rationale.
      // The outbound payload variable in this thunk is `payload` (assembled by
      // assembleManualRequest); the sibling thunk uses `routedPayload`. The
      // initial port of this block (fd97e6368) accidentally referenced an
      // undefined `request`, which crashed every Builder submit with
      // "request is not defined" before the fetch ever fired.
      {
        const routedTools = (payload.tools_replace ??
          payload.tools ??
          []) as Array<{ name?: string }>;
        dispatch(
          setRequestRouting({
            requestId,
            routing: {
              url,
              channel: backend.channel,
              activeServer: selectActiveServer(state),
              sandboxRef: resolveAgentSandboxRef(state, conversationId),
              sandboxAttached: payload.sandbox != null,
              capabilities:
                (payload.client as { capabilities?: string[] } | undefined)
                  ?.capabilities ?? [],
              toolNames: routedTools
                .map((t) => t?.name)
                .filter((n): n is string => typeof n === "string"),
              recordedAt: new Date().toISOString(),
            },
          }),
        );
      }

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

      // Persist outbound payload to IndexedDB BEFORE the network call so the
      // recovery UI on next page load can surface a hung/closed/crashed run.
      // IndexedDB unavailable is non-fatal — proceed without coverage.
      try {
        recoveryId = await payloadSafetyStore.savePending({
          kind: "agent-run",
          label:
            typeof window !== "undefined"
              ? `Manual run — ${document?.title ?? "matrx"}`
              : "Manual run",
          routeHref:
            typeof window !== "undefined"
              ? window.location.pathname + window.location.search
              : "/agents",
          payload: payload as Record<string, unknown>,
          rawUserInput: userInputText || undefined,
        });
      } catch {
        recoveryId = null;
      }

      // resilientFetch: bounded connect timeout (DNS/TLS/server-not-listening
      // fails fast), no wall-clock ceiling on the body (the heartbeat watchdog
      // on processStream is the streaming ceiling).
      const { response } = await resilientFetch(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        },
        {
          connectTimeoutMs: CONNECT_TIMEOUT_MS,
          totalTimeoutMs: null,
          signal: abortController.signal,
          throwOnHttpError: false,
        },
      );

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

      // X-Conversation-ID echo: the server mints the wire conv_id. We DO NOT
      // assert it matches the local Redux conversationId — they're
      // intentionally different. The header presence is just a phase marker
      // for client-timing.
      const headerConversationId = response.headers.get("X-Conversation-ID");
      const conversationIdAt = headerConversationId ? performance.now() : null;

      dispatch(setInstanceStatus({ conversationId, status: "streaming" }));
      dispatch(setRequestStatus({ requestId, status: "streaming" }));
      dispatch(setNetPhase({ id: requestId, phase: "streaming" }));

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
        // Wire convId minted per call is intentionally different from the
        // local Redux conversationId — tell processStream to ignore the
        // wire id on every stream event and dispatch with the local id so
        // streamed messages land in the same Redux entry the optimistic
        // user message lives in (and the response column is rendering).
        forceLocalConversationId: true,
        // Each event resets the heartbeat watchdog → no wedged stream UI.
        onEvent: () => {
          dispatch(beatNetHeartbeat(requestId));
        },
        abortController,
        heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
        maxLifetimeMs: MAX_LIFETIME_MS,
      });

      unregisterAbortController(conversationId);
      dispatch(finishNetRequest({ id: requestId, phase: "completed" }));
      if (recoveryId) {
        void payloadSafetyStore.markSuccess(recoveryId).catch(() => {});
      }
      return { requestId, conversationId };
    } catch (error) {
      unregisterAbortController(conversationId);

      if (error instanceof Error && error.name === "AbortError") {
        dispatch(setInstanceStatus({ conversationId, status: "cancelled" }));
        dispatch(finishNetRequest({ id: requestId, phase: "cancelled" }));
        if (recoveryId) {
          void payloadSafetyStore.deleteEntry(recoveryId).catch(() => {});
        }
        return rejectWithValue("Cancelled");
      }

      // Synthesise the canonical ErrorPayload shape so every consumer sees
      // the same structure. `code` is the retry-classifier code from
      // toNetError ("connect-timeout", "heartbeat-timeout", etc.) — drives
      // retry-or-bail decisions and the "this is a timeout" banner copy.
      const netErr = toNetError(error);
      if (recoveryId) {
        void payloadSafetyStore
          .markFailed(recoveryId, netErr.message)
          .catch(() => {});
      }
      const phase =
        netErr.code === "connect-timeout" ||
        netErr.code === "total-timeout" ||
        netErr.code === "heartbeat-timeout"
          ? "timed-out"
          : "error";
      dispatch(
        finishNetRequest({
          id: requestId,
          phase,
          errorCode: netErr.code,
          errorMessage: netErr.message,
          retryable: netErr.retryable,
        }),
      );

      const message = error instanceof Error ? error.message : "Unknown error";
      dispatch(
        setRequestStatus({
          requestId,
          status: "error",
          error: {
            error_type: "client_error",
            message,
            code: netErr?.code ?? null,
          },
        }),
      );
      dispatch(setInstanceStatus({ conversationId, status: "error" }));
      // Pre-persistence failure: clear the hidden input so the message doesn't
      // linger in the box. It survives as the optimistic user bubble + the
      // `lastSubmittedText` re-apply backup, so nothing is lost.
      const { clearUserInput } =
        await import("../instance-user-input/instance-user-input.slice");
      dispatch(clearUserInput(conversationId));

      return rejectWithValue(
        error instanceof Error ? error.message : "Manual execution failed",
      );
    }
  },
);
