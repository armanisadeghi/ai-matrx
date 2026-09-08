/**
 * sendDirectActionMessage — the generic "system notifies a user" primitive.
 *
 * Finds or creates the 1:1 conversation between the current user and a
 * recipient, then sends a message carrying an optional action envelope (the
 * card/chip surfaces registered in `features/messaging/actions/`). Any feature
 * can notify a person in one call: access requests, CMS requests, agent drift.
 *
 * This is a SERVICE, not a component, so it uses `@ai-matrx/messaging`'s
 * framework-free entry rather than the React provider — the same repository the
 * provider builds, with the same atomic get-or-create and the same explicit-org
 * rule. There is no second copy of the messaging data contract in this repo:
 * `communication.dm_*` table and RPC names live in the package and nowhere else.
 */

import { createMessagingRepository } from "@ai-matrx/messaging/react";
import {
  asClientMessageId,
  asConversationId,
  asOrganizationId,
  asUserId,
} from "@ai-matrx/messaging/react";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { createClient } from "@/utils/supabase/client";
import type { MessageActionData } from "@/features/messaging/types";

async function repositoryFor(currentUserId: string) {
  const client = createClient();
  const organizationId = await ensureOrgId(undefined);
  return createMessagingRepository({
    client,
    identity: {
      userId: asUserId(currentUserId),
      organizationId: asOrganizationId(organizationId),
    },
    resolveSession: async () => {
      const { data } = await client.auth.getSession();
      return data.session !== null;
    },
  });
}

/**
 * Find an existing direct conversation between two users, or create one —
 * ATOMICALLY, in the database. The package advisory-locks the unordered pair,
 * so two "message this user" clicks cannot mint duplicate conversations the way
 * a read-then-insert does.
 */
export async function findOrCreateDirectConversation(
  currentUserId: string,
  recipientId: string,
): Promise<string> {
  const repository = await repositoryFor(currentUserId);
  return repository.getOrCreateDirectConversation(asUserId(recipientId));
}

export interface SendDirectActionMessageArgs {
  currentUserId: string;
  recipientId: string;
  content: string;
  actionData?: MessageActionData;
}

/**
 * Send an (optionally actionable) DM to one recipient. Returns the conversation
 * id and message id, and throws on failure so a batch caller can surface a
 * per-recipient error rather than reporting a send that never happened.
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
  const repository = await repositoryFor(currentUserId);
  const conversationId = await repository.getOrCreateDirectConversation(
    asUserId(recipientId),
  );
  const message = await repository.insertMessage(
    {
      conversationId: asConversationId(conversationId),
      content,
      ...(actionData !== undefined
        ? { action: { kind: actionData.kind, version: 1, payload: actionData.payload } }
        : {}),
    },
    // A system notification is sent once, from one place; the idempotency key
    // still has to be real — it is what makes the insert's own response and the
    // realtime row collapse onto ONE rendered message for every reader.
    asClientMessageId(crypto.randomUUID()),
  );
  return { conversationId, messageId: message.id };
}
