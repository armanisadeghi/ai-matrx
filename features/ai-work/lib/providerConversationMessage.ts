import type { Tables } from "@/types/database.types";
import {
  providerMessageDisplay,
  type ProviderMessageDisplay,
} from "./providerMessageText";

/** Messages loaded per transcript page (initial server read and each earlier page). */
export const PROVIDER_TRANSCRIPT_PAGE_SIZE = 200;

/** The exact chat.message columns a provider transcript reads. */
export const PROVIDER_MESSAGE_COLUMNS =
  "id, conversation_id, role, content, position, status, created_at";

export type ProviderConversationMessageRow = Pick<
  Tables<{ schema: "chat" }, "message">,
  | "id"
  | "conversation_id"
  | "role"
  | "content"
  | "position"
  | "status"
  | "created_at"
>;

export type ProviderConversationMessage = Omit<
  ProviderConversationMessageRow,
  "content"
> & {
  display: ProviderMessageDisplay;
  contentValid: boolean;
};

export function normalizeProviderMessage(
  message: ProviderConversationMessageRow,
): ProviderConversationMessage {
  try {
    return {
      id: message.id,
      conversation_id: message.conversation_id,
      role: message.role,
      position: message.position,
      status: message.status,
      created_at: message.created_at,
      display: providerMessageDisplay(message.content),
      contentValid: true,
    };
  } catch (error) {
    console.error(
      "[normalizeProviderMessage] invalid persisted message content",
      { messageId: message.id, error },
    );
    return {
      id: message.id,
      conversation_id: message.conversation_id,
      role: message.role,
      position: message.position,
      status: message.status,
      created_at: message.created_at,
      display: { text: "", activityCount: 0 },
      contentValid: false,
    };
  }
}
