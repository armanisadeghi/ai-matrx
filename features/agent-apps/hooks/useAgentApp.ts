"use client";

/**
 * useAgentApp
 *
 * The public hook for agent-app rendering. Every shell consumes this hook
 * (Tier-0/1 directly; Tier-2 slot overrides receive the hook output as
 * props; Tier-3 fully-custom apps call it themselves).
 *
 * It wraps the same per-instance Redux slices + thunks that power the
 * Agent Runner at /agents/[id]/run, exposing a stable, narrow public
 * contract:
 *
 *   - Identity:        appId, agentId, agentVersionId, useLatest, surfaceKey
 *   - Conversation:    conversationId (managed)
 *   - Agent metadata:  agent (definition), variableDefinitions, contextSlots
 *   - Variables:       variables (resolved), setVariable(name, value), setVariables(values)
 *   - Context:         contextEntries, setContext(entries), clearContext()
 *   - Resources:       resources, addResource(...), removeResource(id), clearResources()
 *   - User input:      text, setText(value)
 *   - Submit:          submit({ text?, variables?, context? }) → fires smartExecute
 *   - Stream state:    response, requestId, isStreaming, isExecuting,
 *                      streamPhase, streamEvents, error
 *   - History:         messages, loadConversation(id), resetConversation()
 *
 * Tier-3 apps treat this as the entire API. The hook owns the heavy
 * lifting (Redux + thunks + execution routing); the consumer's
 * responsibility is rendering and binding to UI.
 */

import { useCallback, useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";

import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";

import {
  setUserVariableValue,
  setUserVariableValues,
  resetUserVariableValues,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { selectResolvedVariables } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";

import {
  setContextEntries,
  type InstanceContextEntry,
} from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { selectInstanceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";

import {
  addResource,
  removeResource,
  type ManagedResource,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import { selectInstanceResources } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";

import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";

import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";

import {
  selectAccumulatedText,
  selectPrimaryRequest,
  selectRequest,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";

import {
  selectStreamPhase,
  selectIsExecuting,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectConversationMessages } from "@/features/agents/redux/execution-system/messages/messages.selectors";

import { selectAgentExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import {
  setInputPlaceholder,
  setShowFreeformInput,
  setShowAttachments,
  setShowMicrophone,
  setShowUserMessageOptions,
  setShowAssistantMessageOptions,
  setBufferStream,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";

import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";

export interface UseAgentAppArgs {
  /** Agent the app is bound to. */
  agentId: string;
  /** Pinned version, when not using latest. */
  agentVersionId?: string | null;
  /** When true, the app follows the live agent rather than a pinned version. */
  useLatest?: boolean;
  /**
   * The agent-app's id. Used to scope the runner instance + tag conversation
   * metadata so the history sidebar can filter to this app's runs.
   */
  appId: string;
  /**
   * Surface key for focus + autoclear-split routing. Defaults to
   * `agent-app:<appId>` so each app has its own focus channel.
   */
  surfaceKey?: string;
  /** Auto-fire first execution on mount. Rarely useful for apps; default false. */
  autoRun?: boolean;
  /** Allow continuation past turn 1. Default true. */
  allowChat?: boolean;
  /** Variables panel visible at mount. Default: true when the agent has variables. */
  showVariablePanel?: boolean;
  /** Variables panel layout style — passes through to SmartAgentVariables. */
  variablesPanelStyle?:
    | "form"
    | "inline"
    | "wizard"
    | "compact"
    | "guided"
    | "cards";
  /** Show the pre-execution gate before the first run. */
  showPreExecutionGate?: boolean;
  /** Custom pre-execution message. */
  preExecutionMessage?: string;
  /** Show agent-authored definition messages (instructions, welcome). */
  showDefinitionMessages?: boolean;
  /** Show body content of definition messages (default: header-only). */
  showDefinitionMessageContent?: boolean;
  /** Hide reasoning blocks from the transcript. */
  hideReasoning?: boolean;
  /** Hide tool-result blocks from the transcript. */
  hideToolResults?: boolean;

  // ── Settings → dispatched as instance-ui-state setters after the
  //    conversation exists. These flow into Redux so the consuming
  //    components (SmartAgentInput, MessageOptions, etc.) read them
  //    via selectors without needing props.
  /** Override the textarea placeholder. Null = default. */
  inputPlaceholder?: string | null;
  /** Render the freeform text input. False hides it (variables only). */
  showFreeformInput?: boolean;
  /** Show attachment button + resource chips. */
  showAttachments?: boolean;
  /** Show the mic button in the input toolbar. */
  showMicrophone?: boolean;
  /** Show the ⋯ menu on user messages. */
  showUserMessageOptions?: boolean;
  /** Show the ⋯ menu on assistant messages. */
  showAssistantMessageOptions?: boolean;
  /** Buffer the stream — paint only when complete. */
  bufferStream?: boolean;
}

export interface UseAgentAppReturn {
  // ── Identity ───────────────────────────────────────────────────────────
  appId: string;
  agentId: string;
  agentVersionId: string | null;
  useLatest: boolean;
  surfaceKey: string;
  conversationId: string | null;

  // ── Agent metadata (read-only, sourced from the live agent) ────────────
  agent: AgentDefinition | undefined;
  variableDefinitions: AgentDefinition["variableDefinitions"];
  contextSlots: AgentDefinition["contextSlots"];

  // ── Variables ─────────────────────────────────────────────────────────
  variables: Record<string, unknown>;
  setVariable: (name: string, value: unknown) => void;
  setVariables: (values: Record<string, unknown>) => void;
  resetVariables: () => void;

  // ── Context ────────────────────────────────────────────────────────────
  contextEntries: Record<string, InstanceContextEntry>;
  setContext: (entries: Array<{ key: string; value: unknown }>) => void;
  clearContext: () => void;

  // ── Resources (multimodal) ─────────────────────────────────────────────
  resources: Record<string, ManagedResource>;
  addResource: (resource: ManagedResource) => void;
  removeResource: (resourceId: string) => void;

  // ── User input text ────────────────────────────────────────────────────
  text: string;
  setText: (value: string) => void;

  // ── Submit + execution state ───────────────────────────────────────────
  submit: (args?: SubmitArgs) => Promise<void>;
  response: string;
  requestId: string | null;
  isStreaming: boolean;
  isExecuting: boolean;
  streamPhase: ReturnType<typeof selectStreamPhase> extends (
    state: unknown,
  ) => infer R
    ? R
    : never;
  error: string | null;

  // ── History ────────────────────────────────────────────────────────────
  messages: ReturnType<typeof selectConversationMessages> extends (
    state: unknown,
  ) => infer R
    ? R
    : never;
  loadConversation: (conversationId: string) => Promise<void>;
  resetConversation: () => void;

  // ── Configuration mirrors (so shells can read state-of-app) ────────────
  allowChat: boolean;
}

export interface SubmitArgs {
  text?: string;
  variables?: Record<string, unknown>;
  context?: Array<{ key: string; value: unknown }>;
}

const EMPTY_RECORD: Record<string, never> = Object.freeze({});

export function useAgentApp(args: UseAgentAppArgs): UseAgentAppReturn {
  const {
    agentId,
    agentVersionId = null,
    useLatest = false,
    appId,
    autoRun = false,
    allowChat = true,
    showVariablePanel,
    variablesPanelStyle,
    showPreExecutionGate,
    preExecutionMessage,
    showDefinitionMessages,
    showDefinitionMessageContent,
    hideReasoning,
    hideToolResults,
    inputPlaceholder,
    showFreeformInput,
    showAttachments,
    showMicrophone,
    showUserMessageOptions,
    showAssistantMessageOptions,
    bufferStream,
  } = args;
  const surfaceKey = args.surfaceKey ?? `agent-app:${appId}`;

  const dispatch = useAppDispatch();

  // ── Agent payload readiness gate ──────────────────────────────────────
  // The launcher's createInstance reads variableDefinitions + contextSlots
  // from Redux at instance-create time and snapshots them onto the
  // conversation. If we let it fire before the agent has loaded, the
  // instance is permanently seeded with empty variables and the variable
  // panel never appears. Mirror the gate /agents/[id]/run uses:
  // fetchAgentExecutionMinimal first, hand `ready: isReady` to the
  // launcher, so the instance is only created once the payload is real.
  const executionPayload = useAppSelector((state) =>
    selectAgentExecutionPayload(state, agentId),
  );
  const isReady = executionPayload.isReady;

  useEffect(() => {
    if (!agentId) return;
    if (isReady) return;
    void dispatch(fetchAgentExecutionMinimal(agentId));
  }, [agentId, isReady, dispatch]);

  // Use the same managed launcher /agents/[id]/run uses. It owns the
  // conversationId lifecycle, instance creation, focus tracking, etc.
  const launcher = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature: "agent-app",
    config: {
      autoRun,
      allowChat,
      ...(showVariablePanel !== undefined ? { showVariablePanel } : {}),
      ...(variablesPanelStyle ? { variablesPanelStyle } : {}),
      ...(showPreExecutionGate !== undefined ? { showPreExecutionGate } : {}),
      ...(preExecutionMessage ? { preExecutionMessage } : {}),
      ...(showDefinitionMessages !== undefined
        ? { showDefinitionMessages }
        : {}),
      ...(showDefinitionMessageContent !== undefined
        ? { showDefinitionMessageContent }
        : {}),
      ...(hideReasoning !== undefined ? { hideReasoning } : {}),
      ...(hideToolResults !== undefined ? { hideToolResults } : {}),
    },
    runtime: undefined,
    apiEndpointMode: "agent",
    ready: isReady,
  });
  const conversationId = launcher.conversationId;

  // ── Settings → Redux ─────────────────────────────────────────────────
  // Each setting that's defined on the args dispatches a setter once the
  // conversation exists. Per the architecture: settings live in Redux,
  // consuming components (SmartAgentInput, message option menus, etc.)
  // read them via selectors — no prop chains.
  useEffect(() => {
    if (!conversationId) return;
    if (inputPlaceholder === undefined) return;
    dispatch(
      setInputPlaceholder({ conversationId, value: inputPlaceholder ?? null }),
    );
  }, [conversationId, inputPlaceholder, dispatch]);

  useEffect(() => {
    if (!conversationId || showFreeformInput === undefined) return;
    dispatch(setShowFreeformInput({ conversationId, value: showFreeformInput }));
  }, [conversationId, showFreeformInput, dispatch]);

  useEffect(() => {
    if (!conversationId || showAttachments === undefined) return;
    dispatch(setShowAttachments({ conversationId, value: showAttachments }));
  }, [conversationId, showAttachments, dispatch]);

  useEffect(() => {
    if (!conversationId || showMicrophone === undefined) return;
    dispatch(setShowMicrophone({ conversationId, value: showMicrophone }));
  }, [conversationId, showMicrophone, dispatch]);

  useEffect(() => {
    if (!conversationId || showUserMessageOptions === undefined) return;
    dispatch(
      setShowUserMessageOptions({
        conversationId,
        value: showUserMessageOptions,
      }),
    );
  }, [conversationId, showUserMessageOptions, dispatch]);

  useEffect(() => {
    if (!conversationId || showAssistantMessageOptions === undefined) return;
    dispatch(
      setShowAssistantMessageOptions({
        conversationId,
        value: showAssistantMessageOptions,
      }),
    );
  }, [conversationId, showAssistantMessageOptions, dispatch]);

  useEffect(() => {
    if (!conversationId || bufferStream === undefined) return;
    dispatch(setBufferStream({ conversationId, value: bufferStream }));
  }, [conversationId, bufferStream, dispatch]);

  // ── Selectors ─────────────────────────────────────────────────────────

  const agent = useAppSelector((state) =>
    agentId ? selectAgentById(state, agentId) : undefined,
  );

  const variables = useAppSelector((state) =>
    conversationId
      ? selectResolvedVariables(conversationId)(state)
      : EMPTY_RECORD,
  );

  const contextEntries = useAppSelector((state) =>
    conversationId
      ? selectInstanceContextEntries(conversationId)(state)
      : EMPTY_RECORD,
  );

  const resources = useAppSelector((state) =>
    conversationId
      ? selectInstanceResources(conversationId)(state)
      : EMPTY_RECORD,
  );

  const text = useAppSelector((state) =>
    conversationId ? selectUserInputText(conversationId)(state) : "",
  );

  const primaryRequest = useAppSelector((state) =>
    conversationId ? selectPrimaryRequest(conversationId)(state) : undefined,
  );
  const requestId = primaryRequest?.requestId ?? null;

  const response = useAppSelector((state) =>
    requestId ? selectAccumulatedText(requestId)(state) : "",
  );
  const request = useAppSelector((state) =>
    requestId ? selectRequest(requestId)(state) : undefined,
  );
  const isExecuting = useAppSelector((state) =>
    conversationId ? selectIsExecuting(conversationId)(state) : false,
  );
  const streamPhase = useAppSelector((state) =>
    conversationId ? selectStreamPhase(conversationId)(state) : "idle",
  );
  const messages = useAppSelector((state) =>
    conversationId ? selectConversationMessages(conversationId)(state) : [],
  );

  const isStreaming =
    streamPhase === "text_streaming" ||
    streamPhase === "connecting" ||
    streamPhase === "pre_token" ||
    streamPhase === "interstitial";

  const error =
    request && (request as unknown as { errorMessage?: string }).errorMessage
      ? ((request as unknown as { errorMessage?: string }).errorMessage ?? null)
      : null;

  // ── Variable / context / resource writers ────────────────────────────

  const setVariable = useCallback(
    (name: string, value: unknown) => {
      if (!conversationId) return;
      dispatch(setUserVariableValue({ conversationId, name, value }));
    },
    [conversationId, dispatch],
  );

  const setVariables = useCallback(
    (values: Record<string, unknown>) => {
      if (!conversationId) return;
      dispatch(setUserVariableValues({ conversationId, values }));
    },
    [conversationId, dispatch],
  );

  const resetVariables = useCallback(() => {
    if (!conversationId) return;
    dispatch(resetUserVariableValues(conversationId));
  }, [conversationId, dispatch]);

  const setContext = useCallback(
    (entries: Array<{ key: string; value: unknown }>) => {
      if (!conversationId) return;
      dispatch(setContextEntries({ conversationId, entries }));
    },
    [conversationId, dispatch],
  );

  const clearContext = useCallback(() => {
    if (!conversationId) return;
    dispatch(setContextEntries({ conversationId, entries: [] }));
  }, [conversationId, dispatch]);

  const addResourceCb = useCallback(
    (resource: ManagedResource) => {
      if (!conversationId) return;
      dispatch(addResource({ conversationId, resource }));
    },
    [conversationId, dispatch],
  );

  const removeResourceCb = useCallback(
    (resourceId: string) => {
      if (!conversationId) return;
      dispatch(removeResource({ conversationId, resourceId }));
    },
    [conversationId, dispatch],
  );

  const setText = useCallback(
    (value: string) => {
      if (!conversationId) return;
      dispatch(setUserInputText({ conversationId, text: value }));
    },
    [conversationId, dispatch],
  );

  // ── Submit ────────────────────────────────────────────────────────────

  const submit = useCallback(
    async (submitArgs?: SubmitArgs) => {
      if (!conversationId) return;
      // Pre-stage any per-call writes BEFORE dispatching execute, so the
      // executor reads the latest state. smartExecute doesn't take an
      // explicit payload — it composes from the per-instance slices.
      if (submitArgs?.variables) {
        dispatch(
          setUserVariableValues({
            conversationId,
            values: submitArgs.variables,
          }),
        );
      }
      if (submitArgs?.context) {
        dispatch(
          setContextEntries({
            conversationId,
            entries: submitArgs.context,
          }),
        );
      }
      if (submitArgs?.text != null) {
        dispatch(
          setUserInputText({ conversationId, text: submitArgs.text }),
        );
      }
      await dispatch(smartExecute({ conversationId, surfaceKey }));
    },
    [conversationId, dispatch, surfaceKey],
  );

  const loadConversationCb = useCallback(
    async (id: string) => {
      await dispatch(loadConversation({ conversationId: id, surfaceKey }));
    },
    [dispatch, surfaceKey],
  );

  const resetConversation = useCallback(() => {
    if (!conversationId) return;
    dispatch(resetUserVariableValues(conversationId));
    dispatch(setUserInputText({ conversationId, text: "" }));
    dispatch(setContextEntries({ conversationId, entries: [] }));
  }, [conversationId, dispatch]);

  // Tag the conversation with this app's id once the conversationId is
  // available, so the history sidebar can filter by app.
  // (cx_conversation.metadata.app_id) — handled server-side by the
  // execution path; nothing for the hook to do here today. Reserved for a
  // future enhancement if/when client-side metadata stamping is needed.
  useEffect(() => {
    // intentionally empty — metadata stamping handled server-side via
    // sourceFeature="agent-app" + surfaceKey scoping.
  }, [conversationId, appId]);

  return useMemo<UseAgentAppReturn>(
    () => ({
      appId,
      agentId,
      agentVersionId,
      useLatest,
      surfaceKey,
      conversationId,
      agent,
      variableDefinitions: agent?.variableDefinitions ?? null,
      contextSlots: agent?.contextSlots ?? null,
      variables: variables as Record<string, unknown>,
      setVariable,
      setVariables,
      resetVariables,
      contextEntries: contextEntries as Record<string, InstanceContextEntry>,
      setContext,
      clearContext,
      resources: resources as Record<string, ManagedResource>,
      addResource: addResourceCb,
      removeResource: removeResourceCb,
      text,
      setText,
      submit,
      response,
      requestId,
      isStreaming,
      isExecuting,
      streamPhase: streamPhase as UseAgentAppReturn["streamPhase"],
      error,
      messages: messages as UseAgentAppReturn["messages"],
      loadConversation: loadConversationCb,
      resetConversation,
      allowChat,
    }),
    [
      appId,
      agentId,
      agentVersionId,
      useLatest,
      surfaceKey,
      conversationId,
      agent,
      variables,
      setVariable,
      setVariables,
      resetVariables,
      contextEntries,
      setContext,
      clearContext,
      resources,
      addResourceCb,
      removeResourceCb,
      text,
      setText,
      submit,
      response,
      requestId,
      isStreaming,
      isExecuting,
      streamPhase,
      error,
      messages,
      loadConversationCb,
      resetConversation,
      allowChat,
    ],
  );
}
