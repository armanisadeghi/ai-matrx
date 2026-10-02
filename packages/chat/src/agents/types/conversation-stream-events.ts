/**
 * Conversation-level stream-event payloads that are NOT in the
 * auto-generated `types/python-generated/stream-events.ts` because they ride
 * on the conversation pipeline rather than the agent-run event union.
 *
 * Source of truth: `docs/FE_CONVERSATION_API_CHANGES.md` §1. Keep this file
 * in sync if the server-side payload shape ever changes. The Python team's
 * type generator does NOT cover these — same pattern as the `page_extraction`
 * events the scraper emits.
 */

/**
 * Emitted as the FIRST data event on the NDJSON stream returned from
 * `POST /ai/conversations/{conversation_id}/fork-and-run`. Tells the client
 * that the server has created the fork and the subsequent stream events
 * apply to the new conversation. The client should:
 *
 *   1. Record the new `new_conversation_id` so subsequent stream events are
 *      routed to the correct instance / messages slice entry.
 *   2. Optionally navigate the surface to the new conversation immediately
 *      (so the user watches the new turn stream into the fork, not the
 *      source).
 *
 * After this event, the stream produces normal agent output (chunk,
 * tool_event, end, ...) — identical wire shape to `POST /conversations/{id}`.
 */
export interface ConversationForkedEvent {
  kind: "conversation.forked";
  new_conversation_id: string;
  source_conversation_id: string;
  forked_at_position: number | null;
  message_count: number;
}

/**
 * Type guard for the `conversation.forked` first-event-on-stream payload.
 * Stream events arrive untyped from `parseNdjsonStream` (the auto-generated
 * `TypedStreamEvent` union only covers the standard agent events).
 */
export function isConversationForkedEvent(
  event: unknown,
): event is ConversationForkedEvent {
  if (typeof event !== "object" || event === null) return false;
  const e = event as { kind?: unknown };
  return e.kind === "conversation.forked";
}
