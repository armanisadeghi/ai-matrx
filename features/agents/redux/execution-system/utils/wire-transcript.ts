/**
 * The ONE place a Redux transcript becomes wire messages.
 *
 * Two callers need the same thing — "give me this conversation's history in the
 * shape the Python API accepts":
 *
 *   - manual/builder runs (`/ai/manual`), which are stateless by design and
 *     re-send the whole transcript every turn;
 *   - ephemeral agent runs (`/ai/agents/{id}` with `store:false`), which write
 *     no rows, so turn 2+ must replay the history as `prior_messages`.
 *
 * Both used to be one private helper inside the manual thunk; ephemeral
 * multi-turn simply didn't work (it POSTed `/ai/conversations/{id}`, which
 * requires a row an ephemeral run never writes, and 404'd). Keep this shared so
 * the two paths cannot drift.
 */

import type { RootState } from "@/lib/redux/store";
import type { MessageRecord } from "../messages/messages.slice";
import {
  extractContentBlocks,
  extractFlatText,
} from "../messages/messages.selectors";

/** One message as the Python request models accept it (`ChatMessageInput`). */
export interface WireMessage {
  role: string;
  content: unknown;
}

/**
 * Converts `MessageRecord[]` to the wire format the chat endpoints expect.
 * Each record becomes `{ role, content }` where content is a `MessagePart[]`.
 * Falls back to a single text block synthesised from flat text when a record
 * has no structured blocks yet (e.g. an optimistic user message that hasn't
 * been promoted to the server cx_message id).
 */
export function recordsToMessages(records: MessageRecord[]): WireMessage[] {
  return records.map((record) => {
    const blocks = extractContentBlocks(record);
    if (blocks.length > 0) {
      return { role: record.role, content: blocks };
    }
    return {
      role: record.role,
      content: [{ type: "text", text: extractFlatText(record) }],
    };
  });
}

/**
 * The conversation's accumulated transcript, oldest first, system messages
 * excluded (the server owns the system prompt on every path).
 *
 * Reads from a state SNAPSHOT so the caller controls the cut-off: pass the
 * pre-dispatch state and the optimistic user message for THIS turn is
 * naturally excluded — it travels as `user_input`, not as history.
 */
export function selectWireTranscript(
  state: RootState,
  conversationId: string,
): WireMessage[] {
  const entry = state.messages.byConversationId[conversationId];
  if (!entry) return [];

  const ordered: MessageRecord[] = [];
  for (const id of entry.orderedIds) {
    const record = entry.byId[id];
    if (record && record.role !== "system") ordered.push(record);
  }
  return ordered.length > 0 ? recordsToMessages(ordered) : [];
}
