import type { RootState } from "@/lib/redux/store";

const EMPTY_CLIENT_TOOLS: string[] = [];

export const selectInstanceClientTools =
  (conversationId: string) =>
  (state: RootState): string[] =>
    state.instanceClientTools.byConversationId[conversationId] ??
    EMPTY_CLIENT_TOOLS;
