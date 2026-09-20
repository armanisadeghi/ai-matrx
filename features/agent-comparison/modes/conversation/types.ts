import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";

export type ConversationBattleSource = Pick<
  ConversationListItem,
  "conversationId" | "title" | "updatedAt"
>;

export interface ConversationBattleFork {
  columnId: string;
  conversationId: string;
  label: string;
  loadError?: string;
}
