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
import type {
  AssembledAgentStartRequest,
  UserOverrides,
} from "@/features/agents/types/request.types";
import { buildToolInjection } from "../utils/build-tool-injection";
import type { MessagePart } from "@/types/python-generated/stream-events";
import type { Json } from "@/types/database.types";
import { generateRequestId } from "../utils/ids";
import { setInstanceStatus } from "../conversations/conversations.slice";
import {
  selectEditorResourceXml,
  selectResourcePayloads,
} from "../instance-resources/instance-resources.selectors";
import { selectVariablesForRequest } from "../instance-variable-values/instance-variable-values.selectors";
import { selectSettingsOverridesForApi } from "../instance-model-overrides/instance-model-overrides.selectors";
import {
  selectContextPayload,
  selectInstanceContextEntries,
} from "../instance-context/instance-context.selectors";
import {
  buildAmbientContext,
  isFirstTurn,
} from "@/features/agents/ui-first-tools/redux/build-ambient-context";
import {
  selectOrganizationId,
  selectProjectId,
  selectScopeSelectionsContext,
  selectTaskId,
} from "@/lib/redux/slices/appContextSlice";
import { resolveBackendForConversation } from "./resolve-base-url";
import { resolveEndpointPath } from "@/lib/api/resolve-endpoint-path";
import { selectEndpointOverrideConfig } from "@/lib/redux/slices/apiConfigSlice";
import {
  createRequest,
  setRequestStatus,
} from "../active-requests/active-requests.slice";
import { addOptimisticUserMessage } from "../messages/messages.slice";
import { selectMessageCount } from "../messages/messages.selectors";
import { v4 as uuidv4 } from "uuid";
import {
  runAiStream,
  StreamCancelledError,
  StreamPhaseError,
} from "./run-ai-stream";
import { validateMessageBlocks } from "@/features/agents/runtime/validation";
import { getCapabilitiesForConversation } from "@/features/agents/runtime/get-model-capabilities";
import { setUserVariableValues } from "../instance-variable-values/instance-variable-values.slice";
import { markInputSubmitted } from "../instance-user-input/instance-user-input.slice";
import { markResourcesSubmitted } from "../instance-resources/instance-resources.slice";
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
  // Variables for the request — three-tier merge, but untouched scope-bound vars are
  // omitted so the server resolves them from the active scope (see selector).
  const variables = selectVariablesForRequest(conversationId)(state);

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
  // Active scope selections (scope_type_id → scope_id). Shipped as a flat
  // id list; the server unions them with the conversation's tags inside
  // resolve_full_context so the selected scopes' context cells reach the
  // agent. Pre-deploy backends ignore the field (pydantic extra='ignore').
  const scope_ids = Object.values(
    selectScopeSelectionsContext(state) ?? {},
  ).filter((id): id is string => !!id);

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
  if (scope_ids.length > 0) request.scope_ids = scope_ids;
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

  // USER-layer output-directive apply policy. The user's preference is the
  // highest-priority leg of the backend cascade (agent → surface → user).
  // "default" means "don't send" — let the backend resolve its own default
  // (`ask` → approval card). Any other value flows through on every turn.
  const userOverrides = buildUserOverrides(state);
  if (userOverrides) request.user = userOverrides;

  return request;
}

/**
 * Builds the USER-layer overrides object from user preferences. Returns
 * `undefined` when nothing is set (so we omit the `user` field entirely and
 * let the backend resolve from the surface / agent / default cascade).
 */
function buildUserOverrides(state: RootState): UserOverrides | undefined {
  const applyPolicy = state.userPreferences.assistant.directiveApplyPolicy;
  if (applyPolicy && applyPolicy !== "default") {
    return { apply_policy: applyPolicy };
  }
  return undefined;
}

// =============================================================================
// Execute Thunk
// =============================================================================

interface ExecuteInstanceArgs {
  conversationId: string;
  debug?: boolean;
  /**
   * Re-run the last turn instead of sending new input. When true, NO user
   * input is read or sent — the payload carries `{ retry: true }` and the
   * backend re-attempts the conversation's current persisted state (the
   * failed assistant turn is `is_visible_to_model=false`, so the model's
   * context ends at the user's message). Non-destructive: nothing is
   * deleted, the failed turn stays in history. Only valid as a continuation
   * (there must already be at least one persisted turn). Dispatched via the
   * `retryConversationTurn` thunk, which picks this vs. a re-send.
   */
  retry?: boolean;
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
    { conversationId, debug = false, retry = false },
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

      // ── Draft-protection: record what THIS send is submitting ──────────────
      // The stream's clear-on-send paths (`markInputPersisted` on user-request
      // reservation, `clearUserInput` on stream end) only clear the composer
      // when its text still equals `lastSubmittedText`; otherwise they treat it
      // as a live next-message draft and refuse (loudly), per
      // input-draft-protection.ts. The canonical path (smartExecute) sets that
      // via `markInputSubmitted` before calling us, leaving submissionPhase
      // "pending". DIRECT callers (transcript-studio `send`, war-room agent
      // tools, transcription-cleanup, …) don't — so the message they just sent
      // looks like an unsubmitted draft: it never clears and every send screams
      // a false violation. Mark it here for any caller that hasn't (phase still
      // "idle"). No-op for smartExecute (phase already "pending") → zero impact
      // on the canonical chat. Skipped for retry (no input is sent).
      if (
        !retry &&
        userInputEntry?.submissionPhase === "idle" &&
        (userInputEntry.text ?? "").length > 0
      ) {
        const submittedUserValues =
          state.instanceVariableValues.byConversationId[conversationId]
            ?.userValues ?? {};
        dispatch(
          markInputSubmitted({
            conversationId,
            userValues: submittedUserValues,
          }),
        );
      }

      // Snapshot the attachments being sent so the downstream cleanup clears
      // ONLY these — never an attachment the user adds afterward while composing
      // the next message. Runs for EVERY send (smartExecute + direct callers);
      // never for retry (no input/attachments are sent). Parallel to
      // markInputSubmitted above; see instance-resources.slice + process-stream.
      if (!retry) {
        dispatch(markResourcesSubmitted(conversationId));
      }
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

      // ── Capabilities pre-flight (warn-only) ──────────────────────────
      // Catches user-attaches-image to a text-only model before the
      // request hits the model. Warn-only in this rollout phase — the
      // request still goes through. A follow-up ticket flips this to
      // block once we've shaken out any latent data bugs in the
      // capabilities registry.
      const _caps = getCapabilitiesForConversation(state, conversationId);
      if (_caps) {
        const _validation = validateMessageBlocks(payload.user_input, _caps);
        if (_validation.ok === false) {
          console.warn(
            `[executeInstance] capabilities warning (rejected: ${_validation.rejected.join(", ")}): ${_validation.message}`,
            { conversationId, modelInput: _caps.input },
          );
        }
      }

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

      // ─────────────────────────────────────────────────────────────────────
      // OPTIMISTIC USER BUBBLE — fire synchronously BEFORE any await so the
      // user's message lands in the conversation column the instant they hit
      // send. The textarea has already been cleared by `markInputSubmitted`
      // in smartExecute; without this early dispatch the bubble doesn't
      // appear until `buildToolInjection` resolves (the sandbox provider may
      // mint a token, the cache-bypass module may be lazy-loaded), creating
      // a visible gap where the message looks "lost". The assembled text comes
      // from the sync payload above — no need to wait for tool/client injection
      // to render the bubble.
      //
      // Variables are a FIRST-TURN-ONLY concern and are NEVER baked into the
      // message text. They fill the agent's declared template once, never
      // change within a conversation, and are omitted from every continuation
      // payload (see the turn-2+ branch below). Baking them into the optimistic
      // bubble's content was wrong twice over:
      //   1. The DB-persisted user message only ever carries the raw text, so
      //      on reload the variable line vanished (the server stores
      //      `user_input`, not our display string) — variables silently
      //      disappeared from the first turn after a refresh.
      //   2. On continuations the same code re-rendered a stale agent default
      //      the agent never received.
      // Instead the first user bubble renders a display-only variables strip
      // sourced from the instance variable slice (see `FirstTurnVariables`).
      // To make the live first turn identical to a reload, we stamp the exact
      // variables we're sending into `userValues` here — which is precisely
      // what `loadConversation` does with the persisted `cx_conversation.variables`.
      // ─────────────────────────────────────────────────────────────────────
      if (
        isFirstTurn(state, conversationId) &&
        payload.variables &&
        Object.keys(payload.variables).length > 0
      ) {
        dispatch(
          setUserVariableValues({
            conversationId,
            values: payload.variables,
          }),
        );
      }
      const resourceBlocks = Array.isArray(payload.user_input)
        ? payload.user_input.filter((b) => b.type !== "text")
        : [];
      const assembledUserText = Array.isArray(payload.user_input)
        ? ((
            payload.user_input.find((b) => b.type === "text") as
              | (MessagePart & { text?: string })
              | undefined
          )?.text ?? "")
        : typeof payload.user_input === "string"
          ? payload.user_input
          : "";
      const displayContent = assembledUserText;

      let userMessageClientTempId: string | undefined;
      if (
        !retry &&
        (displayContent || userMessageParts || resourceBlocks.length > 0)
      ) {
        const content: MessagePart[] = [];
        if (displayContent) {
          content.push({ type: "text", text: displayContent });
        }
        if (userMessageParts) content.push(...userMessageParts);
        content.push(...resourceBlocks);
        userMessageClientTempId = uuidv4();
        const stateAtSubmit = getState() as RootState;
        const nextPosition = selectMessageCount(conversationId)(stateAtSubmit);
        // Capture the TRUE per-turn context this message carried, frozen at
        // submit time. The user bubble reads this snapshot — never the live
        // conversation-level context, which keeps mutating as the user changes
        // scope / working document. Without this freeze, every historical turn
        // would falsely display the current context. See AgentUserMessage.
        const contextSnapshot =
          selectInstanceContextEntries(conversationId)(stateAtSubmit);
        const userMessageMetadata =
          contextSnapshot.length > 0
            ? ({ context_snapshot: contextSnapshot } as unknown as Json)
            : undefined;
        dispatch(
          addOptimisticUserMessage({
            conversationId,
            clientTempId: userMessageClientTempId,
            content,
            position: nextPosition,
            metadata: userMessageMetadata,
          }),
        );
      }

      // Create the request tracking entry up-front too — same reason: any UI
      // bound to `activeRequests` (status pills, "thinking" indicators) gets
      // wired to the in-flight turn before we yield to the network/registry.
      dispatch(createRequest({ requestId, conversationId }));
      dispatch(setInstanceStatus({ conversationId, status: "running" }));
      dispatch(setRequestStatus({ requestId, status: "connecting" }));

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
      // /agents/{id}. We read from the pre-dispatch `state` snapshot captured
      // at the top of this thunk, NOT `getState()`, so the optimistic user
      // message we just added above doesn't flip a fresh turn-1 into a
      // continuation.
      const isContinuation = selectMessageCount(conversationId)(state) > 0;

      // Ephemeral conversations stream without writing any cx_* rows. The
      // server flag pair `is_new:false, store:false` (see turn-1 routing
      // below) keeps everything stateless. Turn 2+ rides the same
      // `/ai/conversations/{id}` endpoint as a persistent turn — the server
      // honors the same `store:false` semantics.
      const isEphemeral = instance.isEphemeral === true;

      // (Optimistic user bubble + request status were dispatched up-front,
      // before the tool-injection await, so the message renders in the column
      // the instant the user submits — see block above `buildToolInjection`.)

      let url: string;
      let routedPayload: Record<string, unknown>;

      // Endpoint-path override registry (API version + per-path overrides,
      // e.g. the /v2 spine). Applied to the canonical path templates below;
      // base URL / server selection (incl. localhost / sandbox) is untouched.
      const overrideConfig = selectEndpointOverrideConfig(state);

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
        const convPath = resolveEndpointPath(
          "/ai/conversations/{conversation_id}",
          overrideConfig,
        ).replace("{conversation_id}", encodeURIComponent(conversationId));
        url = `${baseUrl}${convPath}`;
        // Continuation only needs user_input, config_overrides, context,
        // tools, client, stream. Admin flags (block_mode, snapshot) are
        // forwarded so each turn honors the latest toggle value, not just
        // turn 1. `tools` / `tools_replace` / `client` come from
        // buildToolInjection above.
        //
        // Retry: omit `user_input` entirely and send `{ retry: true }`. The
        // backend re-runs the conversation's persisted state (the failed
        // assistant turn is hidden from the model) and re-attempts. Every
        // other field (tools, capabilities, memory, scope) resolves
        // identically to a normal turn — see CONVERSATION_FAILURE_AND_RETRY_FE_GUIDE.md.
        routedPayload = {
          ...(retry ? { retry: true } : { user_input: payload.user_input }),
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
          // USER-layer apply policy — re-sent every turn so a mid-conversation
          // preference change applies immediately (omitted when "default").
          ...(payload.user && { user: payload.user }),
          // Latest active scope selections — re-sent every turn so a
          // mid-conversation scope switch applies immediately.
          ...(payload.scope_ids?.length && { scope_ids: payload.scope_ids }),
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
        const agentPath = resolveEndpointPath(
          "/ai/agents/{agent_id}",
          overrideConfig,
        ).replace("{agent_id}", encodeURIComponent(targetId));
        url = `${baseUrl}${agentPath}`;
        routedPayload = {
          ...payload,
          conversation_id: conversationId,
          is_new: !isEphemeral,
          ...(pinnedVersionId && { is_version: true }),
          ...(isEphemeral && { store: false }),
          ...(pendingBypass && { cache_bypass: pendingBypass }),
        } as Record<string, unknown>;
      }

      // Stamp the active scope selections onto the conversation's tags
      // (union, never replace) so resolve_full_context delivers their
      // context cells. Fire-and-forget: ctx_scope_assignments.entity_id has
      // no FK, so tagging works even before the server creates the
      // cx_conversation row on turn 1. The request-body `scope_ids` covers
      // the current turn once the backend deploy lands; the tags cover turn
      // 2+ today and persist which scopes the conversation ran under.
      // Skipped for ephemeral conversations (no persisted rows by design).
      if (!isEphemeral && payload.scope_ids?.length) {
        const { syncConversationScopes } =
          await import("@/features/scopes/redux/thunks/syncConversationScopes");
        void dispatch(syncConversationScopes(conversationId));
      }

      // Record the true submit moment — this is t=0 for all client timing.
      const submitAt = performance.now();

      // TEMP DEBUG (org-id verification) — remove once org-id enforcement
      // ships. Shows exactly what the agent / conversation path is POSTing,
      // including whether organization_id rode along.
      console.log(
        `[Matrx ➜ POST] ${isContinuation ? "conversation" : "agent"}`,
        {
          url,
          organization_id:
            (routedPayload.organization_id as string | undefined) ??
            "(none — not set)",
          project_id: (routedPayload.project_id as string | undefined) ?? null,
          task_id: (routedPayload.task_id as string | undefined) ?? null,
          conversationId,
          payload: routedPayload,
        },
      );

      // Fire the API call + drive the stream through the shared runner. All
      // routing telemetry, heartbeat/abort wiring, status transitions,
      // failPendingToolLifecycle, and the cancel/heartbeat/total/client error
      // classification live in `runAiStream` so this thunk and `resumeInstance`
      // cannot diverge from the stream contract.
      return await runAiStream({
        requestId,
        conversationId,
        url,
        headers,
        body: routedPayload,
        channel: backend.channel,
        dispatch,
        getState: getState as () => RootState,
        submitAt,
        kind: "turn",
        // A retry sends no input and reads none — leave the box untouched
        // (it may hold an unrelated draft). Initial sends clear on failure.
        clearInputOnError: !retry,
        userMessageClientTempId,
      });
    } catch (error) {
      // runAiStream owns its own cleanup for stream-phase errors and signals
      // that via two marker classes. Pre-stream errors (assemble, inject,
      // payload-build, optimistic-message dispatch) reach here without prior
      // cleanup — they need their own.
      if (error instanceof StreamCancelledError) {
        return rejectWithValue("Cancelled");
      }
      if (error instanceof StreamPhaseError) {
        return rejectWithValue(error.message);
      }

      // Pre-stream failure path. Some dispatches may already have run
      // (createRequest, setInstanceStatus("running"), addOptimisticUserMessage)
      // before this throw; the slice reducers are tolerant of unknown ids, so
      // setting "error" is safe whether they ran or not.
      const message = error instanceof Error ? error.message : "Unknown error";
      dispatch(setInstanceStatus({ conversationId, status: "error" }));
      dispatch(
        setRequestStatus({
          requestId,
          status: "error",
          error: { error_type: "client_error", message },
        }),
      );
      if (!retry) {
        const { clearUserInput } =
          await import("../instance-user-input/instance-user-input.slice");
        dispatch(clearUserInput(conversationId));
      }
      return rejectWithValue(message);
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
