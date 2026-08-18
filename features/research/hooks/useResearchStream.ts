"use client";

import { useState, useCallback, useRef } from "react";
import type {
  PhasePayload,
  CompletionPayload,
  ToolEventPayload,
  InfoPayload,
} from "@/lib/api/types";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import {
  isChunkEvent,
  isCompletionEvent,
  isEndEvent,
  isErrorEvent,
  isInfoEvent,
  isPhaseEvent,
  isToolEventEvent,
  isTypedDataEvent,
} from "@/types/python-generated/stream-events";
import { useAppDispatch } from "@/lib/redux/hooks";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import type {
  ResearchStreamStep,
  ResearchDataEvent,
  ResearchInfoEvent,
  ResearchStreamCallbacks,
} from "../types";
import { isResearchDataEventType } from "../types";
import { isJsonObject } from "@/types/json";

export interface StreamMessage {
  id: string;
  timestamp: number;
  status: ResearchStreamStep;
  message: string;
}

export interface StartStreamOptions {
  /**
   * The AbortController whose `signal` the CALLER handed to the api method
   * that produced this `Response` — the FETCH's own controller, never a fresh
   * one. It arms `adoptForeignStream`'s watchdog (heartbeat / lifetime) and is
   * what `cancel()` aborts, so aborting actually closes the body. Omit it when
   * the call site did not create one: the stream then runs without the
   * watchdog, which is what this hook did before adoption — an UNWIRED
   * controller would be worse, leaking the body on every timeout.
   */
  abortController?: AbortController;
}

export interface UseResearchStreamReturn {
  isStreaming: boolean;
  streamingText: string;
  messages: StreamMessage[];
  currentStep: ResearchStreamStep | null;
  error: string | null;
  rawEvents: TypedStreamEvent[];
  infos: ResearchInfoEvent[];
  /** The adopted request id — bind canonical renderers / the live-run window to this. */
  requestId: string | null;
  conversationId: string | null;
  startStream: (
    response: Response,
    callbacks?: ResearchStreamCallbacks,
    options?: StartStreamOptions,
  ) => Promise<void>;
  cancel: () => void;
  clearMessages: () => void;
}

/**
 * Core streaming hook for all research operations.
 *
 * The stream is ADOPTED (`adoptForeignStream`) rather than parsed by hand: the
 * research pipeline endpoints orchestrate their agent runs server-side, so
 * their content lands in `state.activeRequests.byRequestId[requestId]` exactly
 * as a chat stream's does, and every surface renders it with the canonical
 * components off the `requestId` this hook exposes. Never hand-render it.
 *
 * The research DOMAIN events (`data`, `phase`, `info`, …) ride
 * `adoptForeignStream`'s `onEvent`, which exists precisely for a caller's own
 * typed progress events. Content never comes from there.
 *
 * Page load: DB snapshot populates state.
 * After that: every domain object arrives via `data` events and is merged
 * into local state immediately — no DB refetch needed.
 *
 * Pass per-call callbacks to `startStream` for domain-specific handling.
 * The hook handles progress messages and error state automatically.
 */
export function useResearchStream(
  onComplete?: () => void,
): UseResearchStreamReturn {
  const dispatch = useAppDispatch();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [currentStep, setCurrentStep] = useState<ResearchStreamStep | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [rawEvents, setRawEvents] = useState<TypedStreamEvent[]>([]);
  const [infos, setInfos] = useState<ResearchInfoEvent[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const idCounter = useRef(0);

  const addMessage = useCallback(
    (status: ResearchStreamStep, message: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${++idCounter.current}`,
          timestamp: Date.now(),
          status,
          message,
        },
      ]);
    },
    [],
  );

  const startStream = useCallback(
    async (
      response: Response,
      callbacks?: ResearchStreamCallbacks,
      options?: StartStreamOptions,
    ) => {
      abortRef.current = options?.abortController ?? null;
      setIsStreaming(true);
      setError(null);
      setMessages([]);
      setCurrentStep(null);
      setStreamingText("");
      setRawEvents([]);
      setInfos([]);
      setRequestId(null);
      setConversationId(null);

      const handled = [
        "chunk",
        "phase",
        "data",
        "completion",
        "tool_event",
        "error",
        "heartbeat",
        "end",
        "info",
      ];

      const consume = dispatch(
        adoptForeignStream({
          // Only the FETCH's own controller may arm the watchdog — see
          // StartStreamOptions.abortController.
          abortController: options?.abortController,
          onAdopted: (ids) => {
            setRequestId(ids.requestId);
            setConversationId(ids.conversationId);
            callbacks?.onAdopted?.(ids);
          },
          onEvent: (event: TypedStreamEvent) => {
            setRawEvents((prev) => [...prev, event]);

            if (!handled.includes(event.event)) {
              callbacks?.onUnknownEvent?.(
                event as { event: string; data: unknown },
              );
              return;
            }

            if (isChunkEvent(event)) {
              // Content renders from `activeRequests` off `requestId`. This
              // accumulation exists only for the domain callbacks and the
              // surfaces still reading `streamingText`; it is never a parse.
              setStreamingText((prev) => prev + event.data.text);
              callbacks?.onChunk?.(event.data.text);
              return;
            }

            if (isPhaseEvent(event)) {
              const data: PhasePayload = event.data;
              const step = (data.phase as ResearchStreamStep) || "searching";
              setCurrentStep(step);
              addMessage(step, data.phase);
              callbacks?.onStatusUpdate?.(step, data.phase);
              return;
            }

            if (isTypedDataEvent(event)) {
              const data = event.data;
              if (!isJsonObject(data)) return;
              // Wire format uses `type` as the discriminator (Pydantic Literal).
              // Validated against every known ResearchDataEvent tag — an
              // unrecognized tag means the backend added an event this union
              // hasn't been taught yet, and is dropped rather than blindly cast.
              if (isResearchDataEventType(data.type)) {
                // MATRX-EXCEPTION: discriminator is runtime-validated above;
                // per-field validation of all 27 ResearchDataEvent variants
                // is a larger Zod-schema undertaking, tracked as a brief.
                callbacks?.onData?.(data as unknown as ResearchDataEvent);
              }
              return;
            }

            if (isInfoEvent(event)) {
              const data: InfoPayload = event.data;
              const info: ResearchInfoEvent = {
                code: data.code,
                message: data.user_message ?? data.system_message ?? data.code,
                user_message: data.user_message,
                metadata: data.metadata,
              };
              setInfos((prev) => [...prev, info]);
              callbacks?.onInfo?.(info);
              return;
            }

            if (isCompletionEvent(event)) {
              callbacks?.onCompletion?.(
                event.data as unknown as Record<string, unknown>,
              );
              return;
            }

            if (isToolEventEvent(event)) {
              const data: ToolEventPayload = event.data;
              callbacks?.onToolEvent?.(
                data as unknown as Record<string, unknown>,
              );
              return;
            }

            if (isErrorEvent(event)) {
              const msg =
                event.data.user_message ??
                event.data.message ??
                "An error occurred";
              setError(msg);
              setCurrentStep("error");
              callbacks?.onError?.(msg);
              return;
            }

            if (isEndEvent(event)) {
              setCurrentStep("complete");
              callbacks?.onEnd?.();
              onComplete?.();
            }
          },
        }),
      );

      try {
        await consume(response, {
          requestId: response.headers.get("X-Request-ID"),
          conversationId: response.headers.get("X-Conversation-ID"),
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const msg = (err as Error).message;
          setError(msg);
          setCurrentStep("error");
          callbacks?.onError?.(msg);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [dispatch, addMessage, onComplete],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setCurrentStep(null);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentStep(null);
    setError(null);
    setStreamingText("");
    setRawEvents([]);
    setInfos([]);
  }, []);

  return {
    isStreaming,
    streamingText,
    messages,
    currentStep,
    error,
    rawEvents,
    infos,
    requestId,
    conversationId,
    startStream,
    cancel,
    clearMessages,
  };
}
