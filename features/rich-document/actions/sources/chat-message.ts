// features/rich-document/actions/sources/chat-message.ts
//
// Source adapter for chat-message content. Phase 0: only instanceKeyPrefix.
// Phase 1 plugs in edit/delete via the existing editMessage / deleteMessage
// thunks under features/agents/redux/execution-system/message-crud/*.

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
};
