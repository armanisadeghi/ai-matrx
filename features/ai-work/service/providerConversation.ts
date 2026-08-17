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

export type ProviderConversationRow = Pick<
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
  // Provenance columns. Read here because the detail view has to SAY where
  // every field came from — a gap analysis is impossible while "AI Matrx
  // derived this" and "Claude Code reported this" look identical.
  | "conversation_type"
  | "origin_class"
  | "visibility"
  | "created_by"
  | "organization_id"
  | "task_id"
>;

export type ProviderConversation = ProviderConversationRow & {
  /**
   * The caller's favorite flag, from `platform.user_entity_state` via
   * `ues_get_bulk` — NOT the retired `chat.conversation.is_favorite` column.
   *
   * A favorite is per-USER state, so it never belonged on the shared row. Every
   * star in the app writes user_entity_state through the `ues_set` chokepoint;
   * this panel used to project the column, which nothing has written since the
   * cutover, and so reported the opposite of what the user had just clicked.
   */
  is_favorite: boolean;
};

// One literal, not a concatenation: supabase-js infers the row type from the
// select STRING, and a `+`-built value degrades it to GenericStringError.
const CONVERSATION_COLUMNS =
  "id, title, description, source_app, source_feature, status, message_count, initial_agent_id, exclude_from_kg, created_at, updated_at, conversation_type, origin_class, visibility, created_by, organization_id, task_id" as const;

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
      /**
       * A real, readable AI Matrx conversation that is NOT a provider mirror.
       *
       * It used to REDIRECT to /chat, which meant the one surface that explains
       * where a conversation's data comes from was unreachable for the majority
       * of conversations. It now renders the provenance view with a door to
       * runnable chat — the transcript stays provider-only because a mirror is
       * the only kind that has no chat home.
       */
      state: "not-provider";
      detail: null;
      error: null;
      conversation: ProviderConversation;
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
    .select(CONVERSATION_COLUMNS)
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

  // The favorite comes from the store that is written, not from the row. A
  // failed read renders "No" rather than blocking the page — the same loud
  // degrade `applyFavoritesFromUes` uses on the list side.
  const favoriteResult = await supabase.rpc("ues_get_bulk", {
    p_entity_type: "conversation",
    p_entity_ids: [conversationId],
  });
  if (favoriteResult.error) {
    console.error(
      "[providerConversation] favorite read failed — rendering favorite unset",
      favoriteResult.error,
    );
  }
  const conversation: ProviderConversation = {
    ...conversationResult.data,
    is_favorite: (favoriteResult.data ?? []).some((row) => row.is_favorite),
  };

  if (!isProviderSourceApp(conversation.source_app)) {
    return {
      state: "not-provider",
      detail: null,
      error: null,
      conversation,
      initialAgentId: conversation.initial_agent_id,
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
      conversation,
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
