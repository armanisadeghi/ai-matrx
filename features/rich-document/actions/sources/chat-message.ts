// features/rich-document/actions/sources/chat-message.ts
//
// Source adapter for chat-message content.
//
// `edit` is THE chat save adapter (RC-B5): `saveAnswerEdit` splices the edited
// answer text into the row's parts (only the touched text part changes; tool,
// kind, media and thinking parts are carried through), writes nothing when
// nothing changed, and persists through `cx_message_edit` (history archived
// in `content_history`). It replaced wrapping the whole answer as one text
// part, which silently dropped every tool call and citation on save.
//
// `delete` is intentionally NOT wired here — chat deletes are owned by the
// host action bar (DeleteMessageDialog with fork-vs-delete branching). The
// generic `delete-message` action delegates to ctx.callbacks?.onRequestDelete.
// Wiring a "raw" delete here would bypass the user choice.

import type { ContentSource, ContentSourceAdapter } from "../../types";

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
    const { saveAnswerEdit } = await import(
      "@/features/agents/redux/execution-system/message-crud/save-answer-edit.thunk"
    );
    await dispatch(
      saveAnswerEdit({ conversationId, messageId, newText: newContent }),
    ).unwrap();
  },
};
