import type { Tables } from "@/types/database.types";
import { createClient } from "@/utils/supabase/server";
import {
  providerMessageDisplay,
  type ProviderMessageDisplay,
} from "../lib/providerMessageText";
import { isProviderSourceApp } from "../lib/providerSource";

export const PROVIDER_TRANSCRIPT_PAGE_SIZE = 200;

export type ProviderConversation = Pick<
  Tables<{ schema: "chat" }, "conversation">,
  | "id"
  | "title"
  | "description"
  | "source_app"
  | "source_feature"
  | "status"
  | "message_count"
  | "initial_agent_id"
  | "created_at"
  | "updated_at"
>;

type ProviderConversationMessageRow = Pick<
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

export interface ProviderConversationDetail {
  conversation: ProviderConversation;
  messages: ProviderConversationMessage[];
  visibleMessageCount: number;
  hasEarlierMessages: boolean;
}

export type ProviderConversationRead =
  | {
      state: "ready";
      detail: ProviderConversationDetail;
      error: null;
    }
  | {
      state: "not-provider";
      detail: null;
      error: null;
      initialAgentId: string | null;
    }
  | {
      state: "unavailable";
      detail: null;
      error: unknown;
    };

function normalizeProviderMessage(
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
      "[readProviderConversation] invalid persisted message content",
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

/**
 * Direct RLS read of a canonical conversation and its user-visible messages.
 * External coding sessions deliberately have no initial agent, so the normal
 * runnable chat page is not their transcript surface.
 */
export async function readProviderConversation(
  conversationId: string,
): Promise<ProviderConversationRead> {
  const supabase = await createClient();
  const conversationResult = await supabase
    .schema("chat")
    .from("conversation")
    .select(
      "id, title, description, source_app, source_feature, status, message_count, initial_agent_id, created_at, updated_at",
    )
    .eq("id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (conversationResult.error || !conversationResult.data) {
    return {
      state: "unavailable",
      detail: null,
      error: conversationResult.error,
    };
  }

  if (!isProviderSourceApp(conversationResult.data.source_app)) {
    return {
      state: "not-provider",
      detail: null,
      error: null,
      initialAgentId: conversationResult.data.initial_agent_id,
    };
  }

  const messagesResult = await supabase
    .schema("chat")
    .from("message")
    .select(
      "id, conversation_id, role, content, position, status, created_at",
      {
        count: "exact",
      },
    )
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .eq("is_visible_to_user", true)
    .order("position", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(PROVIDER_TRANSCRIPT_PAGE_SIZE);

  if (messagesResult.error) {
    return {
      state: "unavailable",
      detail: null,
      error: messagesResult.error,
    };
  }

  return {
    state: "ready",
    detail: {
      conversation: conversationResult.data,
      messages: [...messagesResult.data]
        .reverse()
        .map(normalizeProviderMessage),
      visibleMessageCount: messagesResult.count ?? messagesResult.data.length,
      hasEarlierMessages:
        (messagesResult.count ?? messagesResult.data.length) >
        messagesResult.data.length,
    },
    error: null,
  };
}
