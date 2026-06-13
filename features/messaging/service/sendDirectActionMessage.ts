/**
 * sendDirectActionMessage — the generic "system notify a user" primitive.
 *
 * Finds or creates a 1:1 conversation between the current user and a recipient,
 * then sends a message carrying an optional `action_data` envelope (deep-link
 * chips). Extracted from the conversation-create flow in useSupabaseMessaging
 * so any feature (drift notifications first) can notify a user in one call.
 *
 * Direct Supabase — no Next.js API hop (the messaging system is client→Supabase).
 */

import { createClient } from "@/utils/supabase/client";
import { getMessagingService } from "@/lib/supabase/messaging";
import type { MessageActionData } from "@/features/messaging/types";

/** Find an existing direct conversation between two users, or create one. */
export async function findOrCreateDirectConversation(
  currentUserId: string,
  recipientId: string,
): Promise<string> {
  const supabase = createClient();

  const { data: existing, error: findError } = await supabase.rpc(
    "find_dm_direct_conversation",
    { p_user1_id: currentUserId, p_user2_id: recipientId },
  );
  if (findError) throw findError;
  if (existing) return existing as string;

  const { data: conv, error: createError } = await supabase
    .from("dm_conversations")
    .insert({ type: "direct", created_by: currentUserId })
    .select("id")
    .single();
  if (createError) throw createError;

  const { error: partError } = await supabase.from("dm_conversation_participants").insert([
    { conversation_id: conv.id, user_id: currentUserId, role: "owner" },
    { conversation_id: conv.id, user_id: recipientId, role: "member" },
  ]);
  if (partError) throw partError;

  return conv.id as string;
}

export interface SendDirectActionMessageArgs {
  currentUserId: string;
  recipientId: string;
  content: string;
  actionData?: MessageActionData;
}

/**
 * Send a (optionally actionable) DM to one recipient. Returns the conversation
 * id and message id. Throws on failure so callers can surface per-recipient
 * errors in a batch send.
 */
export async function sendDirectActionMessage({
  currentUserId,
  recipientId,
  content,
  actionData,
}: SendDirectActionMessageArgs): Promise<{ conversationId: string; messageId: string }> {
  const conversationId = await findOrCreateDirectConversation(currentUserId, recipientId);
  const message = await getMessagingService().sendMessage(
    conversationId,
    currentUserId,
    content,
    { actionData },
  );
  return { conversationId, messageId: message.id };
}
