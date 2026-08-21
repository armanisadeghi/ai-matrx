import { supabase } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";
import {
  normalizeProviderMessage,
  PROVIDER_MESSAGE_COLUMNS,
  PROVIDER_TRANSCRIPT_PAGE_SIZE,
  type ProviderConversationMessage,
} from "../lib/providerConversationMessage";

export interface ProviderConversationMutableState {
  status: string;
  excludeFromKg: boolean;
}

/**
 * Re-reads the canonical mutable facts (archive status, KG exclusion) after a
 * menu mutation, so this server-rendered page reconciles without a reload.
 */
export async function fetchProviderConversationState(
  conversationId: string,
): Promise<ProviderConversationMutableState | null> {
  const { data, error } = await supabase
    .schema("chat")
    .from("conversation")
    .select("status, exclude_from_kg")
    .eq("id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[fetchProviderConversationState] read failed", {
      conversationId,
      message: error.message,
      code: error.code,
    });
    return null;
  }
  if (!data) return null;
  return {
    status: data.status,
    excludeFromKg: data.exclude_from_kg ?? false,
  };
}

export interface EarlierProviderMessagesPage {
  /** Older user-visible messages, ascending (oldest first). */
  messages: ProviderConversationMessage[];
  /** True when messages earlier than this page still exist. */
  hasEarlierMessages: boolean;
}

/**
 * Backward pagination for the read-only provider transcript. Reads the page
 * of user-visible messages strictly BEFORE `beforePosition`, newest-first,
 * then returns them in display (ascending) order. Same RLS boundary as the
 * server read — the browser client only sees the caller's own rows.
 */
export async function fetchEarlierProviderMessages(
  conversationId: string,
  beforePosition: number,
  limit: number = PROVIDER_TRANSCRIPT_PAGE_SIZE,
): Promise<EarlierProviderMessagesPage> {
  const { data, error, count } = await supabase
    .schema("chat")
    .from("message")
    .select(PROVIDER_MESSAGE_COLUMNS, { count: "exact" })
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .eq("is_visible_to_user", true)
    .lt("position", beforePosition)
    .order("position", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[fetchEarlierProviderMessages] read failed", {
      conversationId,
      beforePosition,
      message: error.message,
      code: error.code,
    });
    throw operationFailed("load earlier messages", error);
  }

  return {
    messages: [...data].reverse().map(normalizeProviderMessage),
    hasEarlierMessages: (count ?? data.length) > data.length,
  };
}

/**
 * Forward (newest-side) pagination for a transcript whose coding session is
 * still running. Reads user-visible messages strictly AFTER `afterPosition` in
 * ascending order, so the cursor advances monotonically and a burst larger
 * than one page leaves no gap — it simply lands over the next few reads.
 *
 * `position` is assigned by `cx_message_assign_append_position`, so it is a
 * gap-free per-conversation sequence; ordering by it needs no tiebreak.
 */
export async function fetchNewerProviderMessages(
  conversationId: string,
  afterPosition: number,
  limit: number = PROVIDER_TRANSCRIPT_PAGE_SIZE,
): Promise<ProviderConversationMessage[]> {
  const { data, error } = await supabase
    .schema("chat")
    .from("message")
    .select(PROVIDER_MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .eq("is_visible_to_user", true)
    .gt("position", afterPosition)
    .order("position", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[fetchNewerProviderMessages] read failed", {
      conversationId,
      afterPosition,
      message: error.message,
      code: error.code,
    });
    throw operationFailed("load new messages", error);
  }

  return data.map(normalizeProviderMessage);
}
