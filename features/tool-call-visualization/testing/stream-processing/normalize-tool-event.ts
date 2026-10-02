import type { ToolEventPayload } from "@ai-matrx/agents/generated/stream-events";
import type { ToolStreamEvent } from "../types";

/**
 * Normalizes a wire `tool_event.data` payload into the strict `ToolStreamEvent`
 * shape used by the tool-testing UI.
 */
export function toolEventPayloadToToolStreamEvent(
  data: ToolEventPayload,
): ToolStreamEvent {
  const rawData = data.data;
  const dataRecord: Record<string, unknown> =
    rawData !== undefined &&
    rawData !== null &&
    typeof rawData === "object" &&
    !Array.isArray(rawData)
      ? (rawData as Record<string, unknown>)
      : {};

  return {
    event: data.event,
    call_id: data.call_id,
    tool_name: data.tool_name,
    timestamp: data.timestamp ?? 0,
    message: data.message ?? null,
    show_spinner: data.show_spinner ?? false,
    data: dataRecord,
  };
}
