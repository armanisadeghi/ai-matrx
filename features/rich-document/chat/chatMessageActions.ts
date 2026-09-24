// features/rich-document/chat/chatMessageActions.ts
//
// THE ONE builder that turns a chat message into a RichDocument action
// configuration. Every surface that shows a chat message's actions — the /chat
// assistant and user bars, the proving route (/markdown-studio) — calls this,
// so the same message offers the same action set everywhere. The actions
// themselves live in the one registry (features/rich-document/actions/).

import type {
  ChatMessageExtensions,
  ContentSource,
  RichDocumentActionContextCallbacks,
  RichDocumentActionsProp,
} from "../types";

export interface ChatMessageActionFacts {
  conversationId: string;
  messageId: string;
  role: "assistant" | "user";
  /** Inspectable text of THIS cx_message row (the write-back target). */
  messageContent: string;
  /** True when `messageContent` is the JSON raw view of a structured payload. */
  contentIsStructuredRaw?: boolean;
  /** Aggregated text of the whole multi-iteration turn, when the host groups one. */
  turnContent?: string | null;
  /** Text-bearing row the assistant editor saves to (defaults to this row). */
  editTarget?: ChatMessageExtensions["editTarget"];
  metadata?: Record<string, unknown> | null;
  streamRequestId?: string | null;
  contentHistoryCount?: number;
  groupMessageIds?: string[];
  isCreator?: boolean;
  surfaceKey?: string | null;
  showFullPrint?: boolean;
  isCapturing?: boolean;
  callbacks?: RichDocumentActionContextCallbacks;
}

export interface ChatMessageActionConfig {
  /** What the reader sees — the turn when grouped, else the message. */
  content: string;
  source: ContentSource;
  actions: RichDocumentActionsProp;
}

export function buildChatMessageActions(
  facts: ChatMessageActionFacts,
): ChatMessageActionConfig {
  const isStructuredRaw = facts.contentIsStructuredRaw ?? false;
  const editTarget: ChatMessageExtensions["editTarget"] =
    facts.role === "assistant"
      ? (facts.editTarget ?? {
          messageId: facts.messageId,
          content: facts.messageContent,
          isStructuredRaw,
        })
      : null;
  return {
    content: facts.turnContent ?? facts.messageContent,
    source: {
      type: "chat-message",
      messageId: facts.messageId,
      conversationId: facts.conversationId,
      streamRequestId: facts.streamRequestId ?? null,
    },
    actions: {
      metadata: facts.metadata ?? null,
      isCreator: facts.isCreator ?? false,
      surfaceKey: facts.surfaceKey ?? null,
      callbacks: facts.callbacks,
      extensions: {
        type: "chat-message",
        role: facts.role,
        messageContent: facts.messageContent,
        contentIsStructuredRaw: isStructuredRaw,
        editTarget,
        streamRequestId: facts.streamRequestId ?? null,
        contentHistoryCount: facts.contentHistoryCount ?? 0,
        showFullPrint: facts.showFullPrint ?? false,
        isCapturing: facts.isCapturing ?? false,
        groupMessageIds: facts.groupMessageIds ?? [facts.messageId],
      },
    },
  };
}
