import type { StreamCallbacks } from "@/lib/api/stream-parser";
import type { HeartbeatPayload } from "@ai-matrx/agents/generated/stream-events";
import type {
  StreamEventHandlers,
  ToolStreamEvent,
  FinalPayload,
} from "../types";

/**
 * Narrows universal `StreamCallbacks` for the tool-testing dashboard: maps the
 * demo's `StreamEventHandlers` (phase / tool / final / error / raw) onto the
 * full stream protocol. For other apps, pass handlers directly to
 * `consumeBackendStreamResponse`.
 */
export function buildToolTesterStreamCallbacks(
  handlers: StreamEventHandlers,
): StreamCallbacks {
  return {
    onEvent(event) {
      handlers.onRawEvent?.(event);
    },

    onPhase(data) {
      handlers.onPhase?.(data);
      if (data.phase === "complete") {
        handlers.onFinalResult?.({ status: "complete" } as FinalPayload);
      }
    },

    onToolEvent(data) {
      handlers.onToolEvent?.(data as unknown as ToolStreamEvent);
    },

    onCompletion(data) {
      handlers.onCompletion?.(data);
      handlers.onFinalResult?.(data as unknown as FinalPayload);
    },

    onData(data) {
      handlers.onFinalResult?.(data as unknown as FinalPayload);
    },

    onError(data) {
      handlers.onError?.(data);
    },

    onHeartbeat(_data: HeartbeatPayload) {
      handlers.onHeartbeat?.();
    },

    onEnd(data) {
      handlers.onEnd?.(data);
    },
  };
}

/** @deprecated Use `buildToolTesterStreamCallbacks` */
export const buildToolTestStreamCallbacks = buildToolTesterStreamCallbacks;
