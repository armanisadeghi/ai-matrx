// @ts-nocheck — deprecated file, will be deleted; suppressing stale type errors
"use client";

import { useRef, useEffect } from "react";
import { useChatContext } from "../context/DEPRECATED-ChatContext";
import type {
  TypedStreamEvent,
  ChunkPayload,
  ErrorPayload,
  CompletionPayload,
  EndPayload,
} from "@/types/python-generated/stream-events";
import type {
  AgentStartRequestBody,
  ConversationContinueRequestBody,
} from "@/lib/api/types";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import {
  buildContentArray,
  ContentItem,
  PublicResource,
} from "../types/content";
import { ENDPOINTS, BACKEND_URLS } from "@/lib/api/endpoints";
import { useApiAuth } from "@/hooks/useApiAuth";

// ============================================================================
// TYPES
// ============================================================================

interface UseAgentChatOptions {
  onStreamEvent?: (event: TypedStreamEvent) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

interface SendMessageParams {
  content: string;
  variables?: Record<string, unknown>;
  resources?: PublicResource[];
}

// ============================================================================
// HOOK
// ============================================================================

export function useAgentChat(options: UseAgentChatOptions = {}) {
  const {
    state,
    addMessage,
    updateMessage,
    setStreaming,
    setExecuting,
    setError,
    setDbConversationId,
    conversationIdRef,
  } = useChatContext();
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamEventsRef = useRef<TypedStreamEvent[]>([]);
  const isExecutingRef = useRef(false);
  const serverRequestIdRef = useRef<string | null>(null);

  const { getHeaders, waitForAuth, isAdmin } = useApiAuth();

  useEffect(() => {
    isExecutingRef.current = state.isExecuting;
  }, [state.isExecuting]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current && !isExecutingRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const getBackendUrl = () => {
    if (isAdmin && state.useLocalhost) {
      return BACKEND_URLS.localhost;
    }
    return BACKEND_URLS.production;
  };

  const sendMessage = async ({
    content,
    variables = {},
    resources = [],
  }: SendMessageParams) => {
    if (!state.currentAgent) {
      setError({ type: "config_error", message: "No agent configured" });
      return false;
    }

    const promptId = state.currentAgent.promptId;
    if (!promptId) {
      setError({ type: "config_error", message: "No prompt ID configured" });
      return false;
    }

    const authReady = await waitForAuth();
    if (!authReady) {
      setError({
        type: "auth_error",
        message: "Unable to verify access. Please refresh the page.",
      });
      return false;
    }

    setError(null);
    streamEventsRef.current = [];
    serverRequestIdRef.current = null;

    const contentItems = buildContentArray(content, resources);

    addMessage({
      role: "user",
      content,
      status: "complete",
      resources: resources.length > 0 ? resources : undefined,
      contentItems: contentItems.length > 0 ? contentItems : undefined,
      variables,
    });

    const assistantMessageId = addMessage({
      role: "assistant",
      content: "",
      status: "pending",
    });

    abortControllerRef.current = new AbortController();
    isExecutingRef.current = true;
    setExecuting(true);
    setStreaming(true);

    try {
      const BACKEND_URL = getBackendUrl();
      const headers = getHeaders();

      // NOTE: field names must match the generated `LLMParams` wire schema
      // (types/python-generated/api-types.ts) — `model` / `internal_web_search`,
      // not the stale `ai_model_id` / `web_search_enabled` this hook used to
      // send (those extra keys were silently ignored server-side).
      const configOverrides: Record<string, unknown> = {};
      if (state.modelOverride) {
        configOverrides.model = state.modelOverride;
      }
      if (state.settings.searchEnabled) {
        configOverrides.internal_web_search = true;
      }
      // `thinkEnabled` (boolean UI toggle) has no direct field on `LLMParams`
      // (which takes `thinking_level: "minimal"|"low"|"medium"|"high"`, not a
      // bool) — see ESCALATION brief in the type-fleet worklog; left unmapped
      // rather than guessing a level.

      const userInput: string | Record<string, unknown>[] =
        contentItems.length > 0
          ? (contentItems as unknown as Record<string, unknown>[])
          : content;

      // ── Route to correct endpoint based on conversation state ──
      const blockMode = isAdmin && state.isBlockMode;
      let executeUrl: string;
      let requestBody: AgentStartRequestBody | ConversationContinueRequestBody;

      if (state.dbConversationId) {
        executeUrl = `${BACKEND_URL}${ENDPOINTS.ai.conversationContinue(state.dbConversationId)}`;
        requestBody = {
          user_input: userInput,
          store: true,
          stream: true,
          debug: true,
          context: {},
          block_mode: blockMode,
        } satisfies ConversationContinueRequestBody;
        console.log("[useAgentChat] CONTINUE conversation →", executeUrl);
        console.log("[useAgentChat] dbConversationId:", state.dbConversationId);
      } else {
        // Both branches now hit `/ai/agents/{id}` — the legacy
        // `/ai/prompts/{id}` endpoint is going away. `promptId` is a
        // historical field name; the value stored there has been an agent
        // UUID since the prompts→agents migration, so the endpoint swap
        // is the only change required.
        const startEndpoint = blockMode
          ? ENDPOINTS.ai.agentBlocksStart(promptId)
          : ENDPOINTS.ai.agentStart(promptId);
        executeUrl = `${BACKEND_URL}${startEndpoint}`;
        requestBody = {
          user_input: userInput,
          store: true,
          variables: Object.keys(variables).length > 0 ? variables : undefined,
          config_overrides:
            Object.keys(configOverrides).length > 0
              ? configOverrides
              : undefined,
          stream: true,
          debug: true,
          context: {},
          block_mode: blockMode,
        } satisfies AgentStartRequestBody;
        console.log(
          `[useAgentChat] START ${blockMode ? "BLOCK MODE" : "normal"} agent conversation →`,
          executeUrl,
        );
      }

      updateMessage(assistantMessageId, { status: "streaming" });

      const response = await fetch(executeUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });
      console.log(
        "[useAgentChat] execute response:",
        response.status,
        response.statusText,
      );

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          if (typeof errorData.error === "object" && errorData.error !== null) {
            errorMsg =
              errorData.error.user_message ||
              errorData.error.message ||
              JSON.stringify(errorData.error);
          } else if (typeof errorData.user_message === "string") {
            errorMsg = errorData.user_message;
          } else {
            errorMsg =
              errorData.error ||
              errorData.message ||
              errorData.details ||
              errorMsg;
          }
        } catch {
          // Use default error
        }
        throw new Error(errorMsg);
      }

      if (!response.body) {
        throw new Error("No response body from Agent API");
      }

      const {
        events,
        requestId,
        conversationId: headerConvId,
      } = parseNdjsonStream(response, abortControllerRef.current.signal);
      serverRequestIdRef.current = requestId;

      // Primary handshake: headers arrive before the body, so this is guaranteed
      // to fire before any stream events are processed.
      if (headerConvId && headerConvId !== conversationIdRef.current) {
        setDbConversationId(headerConvId);
        console.log(
          "[useAgentChat] conversation_id from header:",
          headerConvId,
        ); // This is correct.
      }

      let accumulatedContent = "";
      // In block mode, we accumulate all events and push them onto the message
      // so MarkdownStream can render via the server-processed render_block protocol.
      const blockEventsBuffer: TypedStreamEvent[] = [];

      for await (const event of events) {
        streamEventsRef.current.push(event);
        options.onStreamEvent?.(event);

        switch (event.event) {
          case "data": {
            const dataPayload = event.data as unknown as Record<
              string,
              unknown
            >;
            if (
              dataPayload.event === "conversation_id" &&
              dataPayload.conversation_id
            ) {
              const serverId = dataPayload.conversation_id as string;
              if (serverId !== conversationIdRef.current) {
                setDbConversationId(serverId);
                console.log("[useAgentChat] server conversation_id:", serverId);
              }
            }
            break;
          }
          case "chunk": {
            if (blockMode) {
              // Block mode: still accumulate text for fallback/copy, but
              // primary rendering uses events via streamEvents prop.
              const chunkData = event.data as unknown as ChunkPayload;
              accumulatedContent += chunkData.text;
              blockEventsBuffer.push(event);
              updateMessage(assistantMessageId, {
                content: accumulatedContent,
                streamEvents: [...blockEventsBuffer],
              });
            } else {
              const chunkData = event.data as unknown as ChunkPayload;
              accumulatedContent += chunkData.text;
              updateMessage(assistantMessageId, {
                content: accumulatedContent,
              });
            }
            break;
          }
          case "render_block": {
            // Block mode: push new block event and update message events array
            blockEventsBuffer.push(event);
            updateMessage(assistantMessageId, {
              streamEvents: [...blockEventsBuffer],
            });
            break;
          }
          case "tool_event": {
            if (blockMode) {
              blockEventsBuffer.push(event);
              updateMessage(assistantMessageId, {
                streamEvents: [...blockEventsBuffer],
              });
            }
            break;
          }
          case "error": {
            const errData = event.data as unknown as ErrorPayload;
            const errorMessage =
              errData.user_message || errData.message || "Unknown error";
            setError({ type: "stream_error", message: errorMessage });
            options.onError?.(errorMessage);
            break;
          }
          case "completion": {
            const _completion = event.data as unknown as CompletionPayload;
            void _completion;
            break;
          }
          case "heartbeat":
            break;
          case "end": {
            const _endData = event.data as unknown as EndPayload;
            void _endData;
            break;
          }
        }
      }

      updateMessage(assistantMessageId, {
        status: "complete",
        ...(blockMode && blockEventsBuffer.length > 0
          ? { streamEvents: [...blockEventsBuffer] }
          : {}),
      });
      options.onComplete?.();
      return true;
    } catch (error: unknown) {
      const err = error as Error;
      if (err.name === "AbortError") {
        console.log("Request aborted");
        updateMessage(assistantMessageId, {
          status: "error",
          content: "Request cancelled",
        });
      } else {
        console.error("Agent execution error:", err);
        const errorMessage = err.message || "Execution failed";
        setError({ type: "execution_error", message: errorMessage });
        updateMessage(assistantMessageId, {
          status: "error",
          content: errorMessage,
        });
        options.onError?.(errorMessage);
      }
      return false;
    } finally {
      isExecutingRef.current = false;
      setExecuting(false);
      setStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const cancelRequest = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const requestId = serverRequestIdRef.current;
    if (requestId) {
      try {
        const BACKEND_URL = getBackendUrl();
        const headers = getHeaders();
        await fetch(`${BACKEND_URL}${ENDPOINTS.ai.cancel(requestId)}`, {
          method: "POST",
          headers,
        });
      } catch {
        // Best-effort — don't block the UI if cancel fails
      }
    }
  };

  const getStreamEvents = () => streamEventsRef.current;

  return {
    sendMessage,
    cancelRequest,
    getStreamEvents,
    isStreaming: state.isStreaming,
    isExecuting: state.isExecuting,
    error: state.error,
    messages: state.messages,
    conversationId: state.dbConversationId,
  };
}
