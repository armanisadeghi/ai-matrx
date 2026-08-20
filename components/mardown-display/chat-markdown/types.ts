/**
 * Stream Event Types for Chat Markdown Components
 *
 * Re-exports from the auto-generated Python types. All stream event
 * types are defined once in `types/python-generated/stream-events.ts`
 * and consumed everywhere via this re-export or `@/lib/api`.
 */

export type {
  TypedStreamEvent,
  EventType,
  ToolEventType,
  ChunkPayload,
  PhasePayload,
  DataPayload,
  CompletionPayload,
  ErrorPayload,
  ToolEventPayload,
  HeartbeatPayload,
  EndPayload,
  ChunkEvent,
  PhaseEvent,
  TypedDataEvent,
  CompletionEvent,
  ErrorEvent,
  ToolEventEvent,
  HeartbeatEvent,
  EndEvent,
  RenderBlockEvent,
} from "@/types/python-generated/stream-events";

export {
  isChunkEvent,
  isPhaseEvent,
  isTypedDataEvent,
  isCompletionEvent,
  isErrorEvent,
  isToolEventEvent,
  isHeartbeatEvent,
  isEndEvent,
  isRenderBlockEvent,
} from "@/types/python-generated/stream-events";

import type { TypedStreamEvent } from "@/types/python-generated/stream-events";

export function isNewProtocol(events: TypedStreamEvent[]): boolean {
  return events.some((e) => e.event === "render_block");
}
