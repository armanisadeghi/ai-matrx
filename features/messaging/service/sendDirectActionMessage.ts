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

import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { createClient } from "@/utils/supabase/client";
import { getMessagingService } from "@/lib/supabase/messaging";
import type { MessageActionData } from "@/features/messaging/types";

/**
 * Find an existing direct conversation between two users, or create one.
 * Delegates to the ONE canonical, ATOMIC get-or-create RPC
 * (`public.dm_get_or_create_direct_conversation`) — an advisory lock on the pair
 * serializes concurrent callers, so two "message this user" clicks can't mint
 * duplicate conversations (the old select(RPC)-then-insert raced and did).
 */
export async function findOrCreateDirectConversation(
  currentUserId: string,
  recipientId: string,
): Promise<string> {
  const supabase = createClient();

  const organizationId = await ensureOrgId(undefined);
  const { data, error } = await supabase.rpc(
    "dm_get_or_create_direct_conversation",
    {
      p_user1_id: currentUserId,
      p_user2_id: recipientId,
      p_organization_id: organizationId,
    },
  );
  if (error) throw error;
  if (!data) throw new Error("Failed to resolve direct conversation");
  return data as string;
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
}: SendDirectActionMessageArgs): Promise<{
  conversationId: string;
  messageId: string;
}> {
  const conversationId = await findOrCreateDirectConversation(
    currentUserId,
    recipientId,
  );
  const message = await getMessagingService().sendMessage(
    conversationId,
    currentUserId,
    content,
    { actionData },
  );
  return { conversationId, messageId: message.id };
}
