/**
 * System DM primitive — server-side helper for sending in-app direct messages
 * on behalf of a user OR the Matrx System bot, with optional action chips.
 *
 * The ONE way any feature delivers an in-app notification through the DM
 * channel (the working realtime + unread-badge + read-state surface).
 * Consumers: feedback-assignment-notifier, task notifications (assignment,
 * due-date reminders). Best-effort by contract: callers must never let a DM
 * failure block the underlying operation.
 *
 * Server-side only (admin client).
 */

import { createAdminClient } from "@/utils/supabase/adminClient";
import type { Json } from "@/types/database.types";

/**
 * The Matrx System bot — the sender for notifications no human user initiated
 * (cron reminders, automated alerts). Same identity aidream's drift DMs use
 * (auth.users row for system@aimatrx.com in the ONE shared database). If the
 * row ever disappeared, message inserts fail loudly on the FK — no silent
 * fallback path exists.
 */
export const MATRX_SYSTEM_BOT_USER_ID =
  "71b55cc0-f333-462f-8176-f558f866ea5d";

/**
 * Find an existing direct-message conversation between two users, or create
 * one atomically (advisory-locked RPC). Returns the conversation id plus its
 * owning org so callers can stamp org-scoped child rows.
 */
export async function findOrCreateDirectConversation(
  userA: string,
  userB: string,
): Promise<{ conversationId: string; organizationId: string }> {
  const supabase = createAdminClient();
  const { data: conversationId, error: rpcError } = await supabase.rpc(
    "dm_get_or_create_direct_conversation",
    { p_user1_id: userA, p_user2_id: userB },
  );
  if (rpcError) throw rpcError;
  if (!conversationId) {
    throw new Error("Failed to resolve direct conversation");
  }

  const { data: conv, error: convError } = await supabase
    .schema("communication")
    .from("dm_conversations")
    .select("organization_id")
    .eq("id", conversationId as string)
    .single();
  if (convError || !conv) {
    throw convError ?? new Error("DM conversation not found");
  }

  return {
    conversationId: conversationId as string,
    organizationId: conv.organization_id,
  };
}

export interface SendDmOptions {
  /** Sender user id; pass null to send as the Matrx System bot. */
  senderId: string | null;
  recipientId: string;
  content: string;
  /** Optional action chips — `{ kind, payload }` per the message-action registry. */
  actionData?: { kind: string; payload: Record<string, unknown> };
}

export interface SendDmResult {
  ok: boolean;
  conversationId?: string;
  error?: string;
}

/** Send one in-app DM. Best-effort — returns rather than throws. */
export async function sendDm(options: SendDmOptions): Promise<SendDmResult> {
  try {
    const senderId = options.senderId ?? MATRX_SYSTEM_BOT_USER_ID;
    if (senderId === options.recipientId) {
      return { ok: false, error: "self" };
    }
    const { conversationId, organizationId } =
      await findOrCreateDirectConversation(senderId, options.recipientId);
    const supabase = createAdminClient();
    const { error } = await supabase
      .schema("communication")
      .from("dm_messages")
      .insert({
        conversation_id: conversationId,
        organization_id: organizationId,
        sender_id: senderId,
        content: options.content,
        message_type: "text",
        status: "sent",
        action_data: (options.actionData ?? null) as Json,
      });
    if (error) return { ok: false, conversationId, error: error.message };
    return { ok: true, conversationId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
