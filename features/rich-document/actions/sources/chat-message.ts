// features/rich-document/actions/sources/chat-message.ts
//
// Source adapter for chat-message content.
//
// `edit` dispatches the editMessage thunk (which wraps the cx_message_edit
// RPC and round-trips through Supabase).
//
// `delete` is intentionally NOT wired here — chat deletes are owned by the
// host action bar (DeleteMessageDialog with fork-vs-delete branching). The
// generic `delete-message` action delegates to ctx.callbacks?.onRequestDelete.
// Wiring a "raw" delete here would bypass the user choice.

import type { ContentSource, ContentSourceAdapter } from "../../types";
import { wrapTextAsContent } from "../utils";

export const chatMessageAdapter: ContentSourceAdapter = {
  instanceKeyPrefix: (source: ContentSource) => {
    if (source.type !== "chat-message") {
      throw new Error(
        `chatMessageAdapter received non-chat source: ${source.type}`,
      );
    }
    return `msg-${source.messageId}`;
  },

  edit: async ({ newContent, source, dispatch }) => {
    if (source.type !== "chat-message") {
      throw new Error(
        `chatMessageAdapter.edit received non-chat source: ${source.type}`,
      );
    }
    const { conversationId, messageId } = source;
    if (!conversationId || !messageId) {
      throw new Error("chat-message edit requires conversationId + messageId");
    }
    // Lazy import — message-crud thunks are heavy (~MB of import graph)
    // and only chat surfaces need them.
    const { editMessage } = await import(
      "@/features/agents/redux/execution-system/message-crud/edit-message.thunk"
    );
    await dispatch(
      editMessage({
        conversationId,
        messageId,
        // Wrap plain text into the cx_message JSON content shape.
        newContent: wrapTextAsContent(newContent) as never,
      }),
    ).unwrap();
  },
};
