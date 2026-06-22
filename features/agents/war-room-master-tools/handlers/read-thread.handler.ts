/**
 * `war_room_read_thread` handler — READ one thread agent's recent conversation.
 *
 * Resolves the thread (tile) → its agent conversationId via `resolveThread`,
 * hydrates that conversation into Redux (guarded: skip the network load if it's
 * already in memory with messages), then returns the most recent messages
 * flattened to plain text as the tool result.
 *
 * Read-only. Runs immediately (the dispatcher gives it no approval pause). No
 * conversation yet ⇒ a clean `ok:true` result that says so (not an error) — the
 * master can then choose to message the thread fresh.
 */

import type { WarRoomMasterToolHandler } from "./types";
import type {
  WarRoomReadThreadArgs,
  WarRoomReadThreadResult,
  ThreadMessageSummary,
} from "../tools/schemas";
import { resolveThread } from "../service/threadResolver";
import { messageRecordToText } from "../service/messageText";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { selectConversationMessages } from "@/features/agents/redux/execution-system/messages/messages.selectors";

const DEFAULT_LIMIT = 20;

export const readThreadHandler: WarRoomMasterToolHandler<
  WarRoomReadThreadArgs,
  WarRoomReadThreadResult
> = {
  name: "war_room_read_thread",
  async run(args, ctx) {
    const { dispatch, getState } = ctx;
    const limit = args.limit ?? DEFAULT_LIMIT;

    const resolved = await resolveThread(args.thread_id);
    if (!resolved) {
      return {
        ok: false,
        thread_id: args.thread_id,
        message:
          "Unknown thread — no tile with that id is visible to you. Use a " +
          "thread_id from war_room.",
      };
    }

    const conversationId = resolved.conversationId;
    if (!conversationId) {
      return {
        ok: true,
        thread_id: args.thread_id,
        conversation_id: null,
        message_count: 0,
        messages: [],
        message:
          "This thread has no agent conversation yet — nothing to read. You " +
          "can start one with war_room_message_thread (mode='fresh').",
      };
    }

    // Hydrate cold conversations. Guard: skip the network read if it's already
    // in Redux with messages (the read-only hydrate recipe from the spec).
    const alreadyLoaded =
      selectConversationMessages(conversationId)(getState()).length > 0;
    if (!alreadyLoaded) {
      try {
        await dispatch(loadConversation({ conversationId })).unwrap();
      } catch (err) {
        // The conversation row may not exist yet (id minted, no turn sent).
        // Non-fatal — fall through to an empty read.
        console.warn(
          `[war-room/master] read_thread loadConversation skipped for ${conversationId}:`,
          err,
        );
      }
    }

    const all = selectConversationMessages(conversationId)(getState());
    const recent = all.slice(Math.max(0, all.length - limit));
    const messages: ThreadMessageSummary[] = recent.map((rec) => ({
      role: rec.role,
      text: messageRecordToText(rec),
    }));

    return {
      ok: true,
      thread_id: args.thread_id,
      conversation_id: conversationId,
      message_count: all.length,
      messages,
    };
  },
};
