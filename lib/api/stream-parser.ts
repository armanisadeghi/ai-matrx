// lib/api/stream-parser.ts
// Reusable NDJSON stream parser for the Python FastAPI backend.
// Single implementation — all consumers use this instead of inline parsing.

import type {
  TypedStreamEvent,
  ChunkPayload,
  ReasoningChunkPayload,
  PhasePayload,
  InitPayload,
  CompletionPayload,
  ErrorPayload,
  ToolEventPayload,
  WarningPayload,
  InfoPayload,
  HeartbeatPayload,
  EndPayload,
  RenderBlockPayload,
  RecordReservedPayload,
  RecordUpdatePayload,
  TypedDataPayload,
} from "./types";
import {
  isChunkEvent,
  isReasoningChunkEvent,
  isPhaseEvent,
  isInitEvent,
  isTypedDataEvent,
  isCompletionEvent,
  isErrorEvent,
  isToolEventEvent,
  isWarningEvent,
  isInfoEvent,
  isBrokerEvent,
  isHeartbeatEvent,
  isEndEvent,
  isRenderBlockEvent,
  isRecordReservedEvent,
  isRecordUpdateEvent,
  expandCompactEvent,
  isCompactEvent,
} from "./types";
import { BackendApiError } from "./errors";
import {
  captureStreamEvent,
  captureStreamTransportError,
} from "@/lib/diagnostics/captureStreamError";

// ============================================================================
// COMPACT EVENT NORMALIZATION (wire format → TypedStreamEvent)
// ============================================================================

/** Single NDJSON object after JSON.parse — expand compact `e`/`t` lines per python-generated types. */
function normalizeWireEvent(parsed: unknown): TypedStreamEvent {
  if (isCompactEvent(parsed)) {
    return expandCompactEvent(parsed);
  }
  return parsed as TypedStreamEvent;
}

// ============================================================================
// NDJSON STREAM PARSER
// ============================================================================

/**
 * Parse an NDJSON streaming response into typed events.
 *
 * Returns the `X-Request-ID` header value (if present) alongside the generator,
 * so callers can use it for cancellation.
 *
 * Usage:
 * ```typescript
 * const response = await fetch(url, { ... });
 * const { events, requestId } = parseNdjsonStream(response);
 * for await (const event of events) {
 *   if (event.event === 'chunk') appendToMessage(event.data.text);
 * }
 * ```
 */
export function parseNdjsonStream(
  response: Response,
  signal?: AbortSignal,
): {
  events: AsyncGenerator<TypedStreamEvent, void, undefined>;
  requestId: string | null;
  conversationId: string | null;
} {
  const requestId = response.headers.get("X-Request-ID");
  const conversationId = response.headers.get("X-Conversation-ID");
  return {
    events: _parseNdjsonStream(response, signal, { requestId, conversationId }),
    requestId,
    conversationId,
  };
}

async function* _parseNdjsonStream(
  response: Response,
  signal?: AbortSignal,
  ctx?: { requestId: string | null; conversationId: string | null },
): AsyncGenerator<TypedStreamEvent, void, undefined> {
  if (!response.body) {
    throw new BackendApiError({
      code: "internal_error",
      detail: "Response has no body",
      userMessage: "No response received from server",
    });
  }

  // Read-ahead queue: the reader loop runs independently of the consumer so
  // that TCP flow-control backpressure never causes the server to see a stall
  // (and emit GeneratorExit). Large payloads (e.g. Brave search results) used
  // to suspend reader.read() while React processed the previous yield, which
  // filled the server-side send buffer and dropped all subsequent events.
  //
  // Notification design: we use a "pending wakeups" counter rather than a
  // single resolve callback to avoid the race where notify() fires while the
  // consumer is between the queue-empty check and the await-new-Promise.
  // Each push increments the counter; each consumer wakeup decrements it.
  // If the counter is already > 0 when the consumer would sleep, it skips
  // the sleep entirely — no wakeup is ever lost.
  const queue: Array<TypedStreamEvent | BackendApiError | null> = []; // null = done
  let pendingWakeups = 0;
  let resolveWaiter: (() => void) | null = null;

  const pushItem = (item: TypedStreamEvent | BackendApiError | null) => {
    queue.push(item);
    pendingWakeups++;
    if (resolveWaiter) {
      const r = resolveWaiter;
      resolveWaiter = null;
      r();
    }
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  // Background reader — never yields, never pauses on consumer backpressure.
  const readLoop = async () => {
    let buffer = "";
    try {
      while (true) {
        if (signal?.aborted) break;

        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed: unknown = JSON.parse(trimmed);
            pushItem(normalizeWireEvent(parsed));
          } catch {
            console.warn(
              "[stream-parser] Failed to parse NDJSON line:",
              trimmed.slice(0, 100),
            );
          }
        }
      }

      // Required: flush pending UTF-8 code units when { stream: true } was used.
      // Without this, multi-byte characters split across chunk boundaries can drop
      // the tail of the stream (including the final NDJSON line and "end" event).
      buffer += decoder.decode();

      // Flush any remaining partial line (no trailing newline from server).
      const remaining = buffer.trim();
      if (remaining) {
        try {
          pushItem(normalizeWireEvent(JSON.parse(remaining)));
        } catch (parseErr) {
          console.warn(
            "[stream-parser] Trailing NDJSON incomplete or invalid (len=%s): %s",
            String(remaining.length),
            remaining.slice(0, 500),
            parseErr,
          );
        }
      }
    } catch (err) {
      if (err instanceof BackendApiError) {
        pushItem(err);
      } else if (!(err instanceof Error && err.name === "AbortError")) {
        // AbortError is the normal cancellation path — suppress it.
        // Only log unexpected errors (network failures, etc.).
        console.error("[stream-parser] readLoop error:", err);
      }
    } finally {
      reader.releaseLock();
      pushItem(null); // sentinel: stream finished
    }
  };

  // Start the background reader immediately — do not await it here.
  const readerPromise = readLoop();

  // Consumer loop: yield queued events as fast as the caller processes them.
  // The reader above never waits on the caller — it always keeps reading.
  try {
    while (true) {
      // If no pending wakeups, sleep until the reader pushes something.
      if (pendingWakeups === 0) {
        await new Promise<void>((resolve) => {
          resolveWaiter = resolve;
          // Guard: if a wakeup arrived between the check above and
          // setting resolveWaiter, resolve immediately.
          if (pendingWakeups > 0) {
            resolveWaiter = null;
            resolve();
          }
        });
      }

      pendingWakeups--;

      const item = queue.shift();
      if (item === null || item === undefined) break; // null = done sentinel

      if (item instanceof BackendApiError) {
        // Transport-level stream failure → Error Inspector, then propagate.
        captureStreamTransportError(item, ctx ?? {});
        throw item;
      }

      // Universal stream-error capture: every consumer (agent processStream,
      // consumeStream, podcast, research) pulls events through here, so this
      // single call feeds the Inspector with every server-emitted typed error
      // / warning / failure. Non-error events are ignored inside the adapter.
      captureStreamEvent(item, ctx ?? {});

      yield item;
    }
  } finally {
    // Ensure the background reader is awaited to avoid unhandled rejections.
    await readerPromise;
  }
}

// ============================================================================
// STREAM EVENT HELPERS
// ============================================================================

/** Extract accumulated text from chunk events */
export function accumulateChunks(events: TypedStreamEvent[]): string {
  let text = "";
  for (const event of events) {
    if (isChunkEvent(event)) {
      text += event.data.text;
    }
  }
  return text;
}

/** Extract the first error from stream events, if any */
export function findStreamError(
  events: TypedStreamEvent[],
): ErrorPayload | null {
  for (const event of events) {
    if (isErrorEvent(event)) {
      return event.data;
    }
  }
  return null;
}

// ============================================================================
// CALLBACK-BASED STREAM CONSUMER
// ============================================================================

/**
 * V2 Stream event handler callbacks.
 *
 * Every V2 event type has its own typed callback. Any feature can use this
 * by passing only the callbacks it cares about — all others are silently
 * skipped. This is the universal interface that all non-Redux stream
 * consumers should adopt.
 */
export interface StreamCallbacks {
  onEvent?: (event: TypedStreamEvent) => void;
  onChunk?: (data: ChunkPayload) => void;
  onReasoningChunk?: (data: ReasoningChunkPayload) => void;
  onPhase?: (data: PhasePayload) => void;
  onInit?: (data: InitPayload) => void;
  onCompletion?: (data: CompletionPayload) => void;
  onData?: (data: TypedDataPayload | Record<string, unknown>) => void;
  onToolEvent?: (data: ToolEventPayload) => void;
  onWarning?: (data: WarningPayload) => void;
  onInfo?: (data: InfoPayload) => void;
  onError?: (data: ErrorPayload) => void;
  onRenderBlock?: (data: RenderBlockPayload) => void;
  onRecordReserved?: (data: RecordReservedPayload) => void;
  onRecordUpdate?: (data: RecordUpdatePayload) => void;
  onHeartbeat?: (data: HeartbeatPayload) => void;
  onEnd?: (data: EndPayload) => void;
  onBroker?: (data: unknown) => void;
}

/**
 * Consume a streaming response with typed V2 callbacks.
 *
 * This is the universal stream consumer for non-Redux code paths.
 * Features like the scraper, tool testing, and admin hooks should
 * use this instead of writing their own for-await/switch loops.
 *
 * Returns headers extracted from the response (requestId, conversationId)
 * and accumulated text for convenience.
 */
export async function consumeStream(
  response: Response,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<{
  requestId: string | null;
  conversationId: string | null;
  accumulatedText: string;
}> {
  const { events, requestId, conversationId } = parseNdjsonStream(
    response,
    signal,
  );

  let accumulatedText = "";

  for await (const event of events) {
    callbacks.onEvent?.(event);

    if (isChunkEvent(event)) {
      accumulatedText += event.data.text;
      callbacks.onChunk?.(event.data);
    } else if (isReasoningChunkEvent(event)) {
      callbacks.onReasoningChunk?.(event.data);
    } else if (isPhaseEvent(event)) {
      callbacks.onPhase?.(event.data);
    } else if (isInitEvent(event)) {
      callbacks.onInit?.(event.data);
    } else if (isCompletionEvent(event)) {
      callbacks.onCompletion?.(event.data);
    } else if (isTypedDataEvent(event)) {
      callbacks.onData?.(event.data);
    } else if (isToolEventEvent(event)) {
      callbacks.onToolEvent?.(event.data);
    } else if (isWarningEvent(event)) {
      callbacks.onWarning?.(event.data);
    } else if (isInfoEvent(event)) {
      callbacks.onInfo?.(event.data);
    } else if (isErrorEvent(event)) {
      callbacks.onError?.(event.data);
    } else if (isRenderBlockEvent(event)) {
      callbacks.onRenderBlock?.(event.data);
    } else if (isRecordReservedEvent(event)) {
      callbacks.onRecordReserved?.(event.data);
    } else if (isRecordUpdateEvent(event)) {
      callbacks.onRecordUpdate?.(event.data);
    } else if (isHeartbeatEvent(event)) {
      callbacks.onHeartbeat?.(event.data);
    } else if (isEndEvent(event)) {
      callbacks.onEnd?.(event.data);
    } else if (isBrokerEvent(event)) {
      callbacks.onBroker?.(event.data);
    }
  }

  return { requestId, conversationId, accumulatedText };
}
