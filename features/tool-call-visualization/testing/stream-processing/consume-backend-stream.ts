import { consumeStream, type StreamCallbacks } from "@/lib/api/stream-parser";
import type { TypedStreamEvent } from "@ai-matrx/agents/generated/stream-events";

/**
 * Handlers for the Python NDJSON stream — same contract as `StreamCallbacks`
 * in `@/lib/api/stream-parser`. Use with any `Response` whose body is V2 NDJSON
 * (chat, agent, tool execute, etc.).
 */
export type BackendStreamHandlers = StreamCallbacks;

export type ConsumeBackendStreamResult = {
  requestId: string | null;
  conversationId: string | null;
  accumulatedText: string;
};

/**
 * Universal entry: consume an already-fetched streaming `Response` (no URL,
 * no `fetch`). Dispatches every V2 event type to the matching optional handler.
 *
 * @example
 * ```ts
 * const res = await fetch(url, { method: "POST", headers, body });
 * await consumeBackendStreamResponse(res, {
 *   onEvent: (e) => console.log(e.event),
 *   onToolEvent: (d) => { ... },
 *   onCompletion: (d) => { ... },
 * }, signal);
 * ```
 */
export async function consumeBackendStreamResponse(
  response: Response,
  handlers: BackendStreamHandlers,
  signal?: AbortSignal,
): Promise<ConsumeBackendStreamResult> {
  return consumeStream(response, handlers, signal);
}

/**
 * Merge handlers with an `onEvent` that appends every wire event to `sink`
 * (then forwards to an existing `onEvent` if provided). After the stream
 * finishes, run `foldBackendStreamEvents(sink)` for a full structured snapshot.
 */
export function withRawEventCapture(
  sink: TypedStreamEvent[],
  handlers: BackendStreamHandlers = {},
): BackendStreamHandlers {
  const userOnEvent = handlers.onEvent;
  return {
    ...handlers,
    onEvent(event) {
      sink.push(event);
      userOnEvent?.(event);
    },
  };
}
