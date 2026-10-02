import type { ChatRootState } from "../../../../store/root-state";

const EMPTY_CLIENT_TOOLS: string[] = [];

export const selectInstanceClientTools =
  (conversationId: string) =>
  (state: ChatRootState): string[] =>
    state.instanceClientTools.byConversationId[conversationId] ??
    EMPTY_CLIENT_TOOLS;
