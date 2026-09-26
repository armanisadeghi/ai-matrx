import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";

export type ConversationBattleSource = Pick<
  ConversationListItem,
  "conversationId" | "title" | "updatedAt"
> & {
  /** The source conversation's agent — a saved fork entry falls back to it. */
  agentId?: string | null;
};

export interface ConversationBattleFork {
  columnId: string;
  conversationId: string;
  label: string;
  loadError?: string;
}

export interface ConversationBattleState {
  source: ConversationBattleSource | null;
  forks: ConversationBattleFork[];
  /** Number the next fork is labelled with ("Fork 3"). */
  nextForkNumber: number;
  activeSetId: string | null;
  activeSetName: string | null;
}
