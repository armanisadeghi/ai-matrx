import type { Tables } from "@/types/database.types";
import { createClient } from "@/utils/supabase/server";
import {
  normalizeProviderMessage,
  PROVIDER_MESSAGE_COLUMNS,
  PROVIDER_TRANSCRIPT_PAGE_SIZE,
  type ProviderConversationMessage,
} from "../lib/providerConversationMessage";
import { isProviderSourceApp } from "../lib/providerSource";

export { PROVIDER_TRANSCRIPT_PAGE_SIZE };

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
  | "exclude_from_kg"
  | "created_at"
  | "updated_at"
>;

export type { ProviderConversationMessage };

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
      "id, title, description, source_app, source_feature, status, message_count, initial_agent_id, exclude_from_kg, created_at, updated_at",
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
    .select(PROVIDER_MESSAGE_COLUMNS, {
      count: "exact",
    })
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
