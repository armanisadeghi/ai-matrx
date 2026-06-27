"use client";

/**
 * useConversationSession — Primary hook for conversation lifecycle management.
 *
 * Encapsulates session init, message sending, history loading, and cleanup.
 * Consumers provide configuration; this hook handles all Redux orchestration.
 *
 * Usage:
 * ```tsx
 * const { sessionId, send, cancel, isStreaming, messages } = useConversationSession({
 *     agentId: 'prompt-uuid',
 *     apiMode: 'agent',
 * });
 * ```
 */

import { useEffect, useRef, useCallback, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { chatConversationsActions } from "../_legacy-stubs";
import { sendMessage } from "../_legacy-stubs";
import { loadConversationHistory } from "../_legacy-stubs";
import {
  selectMessages,
  selectIsStreaming,
  selectIsExecuting,
  selectSessionStatus,
  selectSessionError,
  selectConversationId,
  selectCurrentInput,
  selectResources,
  selectVariableDefaults,
  selectUIState,
  selectApiMode,
} from "../_legacy-stubs";
import type {
  ApiMode,
  ChatModeConfig,
  ConversationResource,
} from "../_legacy-stubs";
import type { PromptVariable } from "@/features/prompts/types/core";
import type { Resource } from "@/features/agents/resources/types";

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface ConversationSessionConfig {
  /** Agent/Prompt ID — required for agent and chat modes */
  agentId: string;

  /** API mode: 'agent' (default), 'conversation', or 'chat' */
  apiMode?: ApiMode;

  /** Pre-existing session ID to reuse (e.g. from URL params). Auto-generated if omitted. */
  sessionId?: string;

  /** Pre-existing conversation ID (required for 'conversation' mode, optional for 'agent') */
  conversationId?: string;

  /** Whether to auto-load conversation history when conversationId is provided */
  loadHistory?: boolean;

  /** Variable definitions for the agent's template variables */
  variableDefaults?: PromptVariable[];

  /** Pre-filled variable values */
  variables?: Record<string, string>;

  /** Whether variables must be filled before first send */
  requiresVariableReplacement?: boolean;

  /** Model override (overrides agent default) */
  modelOverride?: string;

  /** Chat mode configuration (required when apiMode === 'chat') */
  chatModeConfig?: ChatModeConfig;
}

// ============================================================================
// RETURN TYPE
// ============================================================================

export interface ConversationSessionReturn {
  /** The session ID — pass to ConversationShell or use individually */
  sessionId: string;

  /** The server-assigned conversation ID (null until first response in agent mode) */
  conversationId: string | null;

  /** Current API mode for this session */
  apiMode: ApiMode;

  /** All messages in the conversation */
  messages: ReturnType<typeof selectMessages>;

  /** Whether the assistant is currently streaming */
  isStreaming: boolean;

  /** Whether a request is being executed (includes pre-stream phase) */
  isExecuting: boolean;

  /** Current session status */
  status: ReturnType<typeof selectSessionStatus>;

  /** Current error, if any */
  error: string | null;

  /** Current text input value */
  currentInput: string;

  /** Currently attached resources */
  resources: Resource[];

  /** Variable definitions */
  variableDefaults: PromptVariable[];

  /** UI state (model override, block mode, etc.) */
  uiState: ReturnType<typeof selectUIState>;

  /** Send a message */
  send: (
    content: string,
    options?: {
      resources?: ConversationResource[];
      variables?: Record<string, unknown>;
    },
  ) => void;

  /** Cancel the current streaming request */
  cancel: () => void;

  /** Clear all messages and reset the session */
  clearMessages: () => void;

  /** Update the text input */
  setInput: (input: string) => void;

  /** Add a resource attachment */
  addResource: (resource: Resource) => void;

  /** Remove a resource attachment */
  removeResource: (resourceId: string) => void;

  /** Update UI state (model override, block mode, etc.) */
  updateUIState: (updates: Partial<ReturnType<typeof selectUIState>>) => void;

  /** Update a template variable value */
  updateVariable: (name: string, value: string) => void;
}

// ============================================================================
// HOOK
// ============================================================================

export function useConversationSession(
  config: ConversationSessionConfig,
): ConversationSessionReturn {
  const dispatch = useAppDispatch();

  // Stable session ID — generated once, or use provided
  const sessionIdRef = useRef(config.sessionId ?? uuidv4());
  const sessionId = sessionIdRef.current;

  // Track active abort controllers: callId → AbortController
  // Map (not a single ref) so multiple in-flight calls on the same session are
  // all trackable and cancellable independently.
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Track whether we've initialized to avoid double-init in StrictMode
  const initializedRef = useRef(false);

  // ── Initialize session on mount ──────────────────────────────────────────
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    dispatch(
      chatConversationsActions.startSession({
        sessionId,
        agentId: config.agentId,
        apiMode: config.apiMode ?? "agent",
        chatModeConfig: config.chatModeConfig,
        conversationId: config.conversationId,
        variableDefaults: config.variableDefaults,
        variables: config.variables,
        requiresVariableReplacement: config.requiresVariableReplacement,
        modelOverride: config.modelOverride,
      }),
    );

    // Auto-load history if conversationId is provided
    if (config.conversationId && config.loadHistory !== false) {
      dispatch(
        loadConversationHistory({
          sessionId,
          conversationId: config.conversationId,
          agentId: config.agentId,
        }),
      );
    }

    return () => {
      // Cleanup session on unmount
      dispatch(chatConversationsActions.removeSession(sessionId));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Redux state ──────────────────────────────────────────────────────────
  const messages = useAppSelector((s) => selectMessages(s, sessionId));
  const isStreaming = useAppSelector((s) => selectIsStreaming(s, sessionId));
  const isExecuting = useAppSelector((s) => selectIsExecuting(s, sessionId));
  const status = useAppSelector((s) => selectSessionStatus(s, sessionId));
  const error = useAppSelector((s) => selectSessionError(s, sessionId));
  const conversationId = useAppSelector((s) =>
    selectConversationId(s, sessionId),
  );
  const currentInput = useAppSelector((s) => selectCurrentInput(s, sessionId));
  const resources = useAppSelector((s) => selectResources(s, sessionId));
  const variableDefaults = useAppSelector((s) =>
    selectVariableDefaults(s, sessionId),
  );
  const uiState = useAppSelector((s) => selectUIState(s, sessionId));
  const apiMode = useAppSelector((s) => selectApiMode(s, sessionId));

  // ── Actions ──────────────────────────────────────────────────────────────

  const send = useCallback(
    (
      content: string,
      options?: {
        resources?: ConversationResource[];
        variables?: Record<string, unknown>;
      },
    ) => {
      const callId = uuidv4();
      const controller = new AbortController();
      abortControllersRef.current.set(callId, controller);

      const thunk = dispatch(
        sendMessage({
          sessionId,
          content,
          resources: options?.resources,
          variables: options?.variables,
          signal: controller.signal,
        }),
      );

      // Clean up the controller once the thunk resolves (success or error)
      Promise.resolve(thunk).finally(() => {
        abortControllersRef.current.delete(callId);
      });
    },
    [dispatch, sessionId],
  );

  const cancel = useCallback(() => {
    for (const controller of abortControllersRef.current.values()) {
      controller.abort();
    }
    abortControllersRef.current.clear();
  }, []);

  const clearMessages = useCallback(() => {
    dispatch(chatConversationsActions.clearMessages(sessionId));
  }, [dispatch, sessionId]);

  const setInput = useCallback(
    (input: string) => {
      dispatch(chatConversationsActions.setCurrentInput({ sessionId, input }));
    },
    [dispatch, sessionId],
  );

  const addResource = useCallback(
    (resource: Resource) => {
      dispatch(chatConversationsActions.addResource({ sessionId, resource }));
    },
    [dispatch, sessionId],
  );

  const removeResource = useCallback(
    (resourceId: string) => {
      dispatch(
        chatConversationsActions.removeResource({ sessionId, resourceId }),
      );
    },
    [dispatch, sessionId],
  );

  const updateUIState = useCallback(
    (updates: Partial<ReturnType<typeof selectUIState>>) => {
      dispatch(chatConversationsActions.updateUIState({ sessionId, updates }));
    },
    [dispatch, sessionId],
  );

  const updateVariable = useCallback(
    (name: string, value: string) => {
      dispatch(
        chatConversationsActions.updateVariable({
          sessionId,
          variableName: name,
          value,
        }),
      );
    },
    [dispatch, sessionId],
  );

  return useMemo(
    () => ({
      sessionId,
      conversationId,
      apiMode: apiMode as ApiMode,
      messages,
      isStreaming,
      isExecuting,
      status,
      error,
      currentInput,
      resources: resources as unknown as Resource[],
      variableDefaults: variableDefaults as unknown as PromptVariable[],
      uiState,
      send,
      cancel,
      clearMessages,
      setInput,
      addResource,
      removeResource,
      updateUIState,
      updateVariable,
    }),
    [
      sessionId,
      conversationId,
      apiMode,
      messages,
      isStreaming,
      isExecuting,
      status,
      error,
      currentInput,
      resources,
      variableDefaults,
      uiState,
      send,
      cancel,
      clearMessages,
      setInput,
      addResource,
      removeResource,
      updateUIState,
      updateVariable,
    ],
  );
}
