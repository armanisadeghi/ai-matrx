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
 *
 * 🚨 NOBODY TELLS THIS FUNCTION WHO IS SENDING (DD-241). It used to take a
 * `currentUserId`, and every caller got that string the same way — Redux's
 * `selectUserId`, a copy written once at boot that nothing rewrites when the
 * domain-wide auth cookie rotates to another account. That copy was not merely
 * a read argument here: `@ai-matrx/messaging` put it on the wire as
 * `p_user1_id`, `sender_id` and `created_by`, so after a sign-out/sign-in in
 * the same tab the send was either refused at 403 or landed as the wrong
 * person. Since `@ai-matrx/messaging` 0.12.0 the package reads the acting user
 * from the session of the client it is given — the same session that mints the
 * JWT on the very request — so the argument is GONE, not merely unused. An
 * argument nobody can supply safely is a door, not a convenience.
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
import { isJsonObject } from "@/types/json";
import type { MessageActionData } from "@/features/messaging/types";

function asActionPayload(action: MessageActionData): Readonly<Record<string, unknown>> {
  if (!isJsonObject(action.payload)) {
    throw new Error(
      `[messaging] The "${action.kind}" action payload must be an object; got ` +
        `${typeof action.payload}. Every action surface destructures it.`,
    );
  }
  return action.payload;
}

async function repository() {
  const client = createClient();
  const organizationId = await ensureOrgId(undefined);
  return createMessagingRepository({
    client,
    organizationId: asOrganizationId(organizationId),
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
  recipientId: string,
): Promise<string> {
  const repo = await repository();
  return repo.getOrCreateDirectConversation(asUserId(recipientId));
}

export interface SendDirectActionMessageArgs {
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
  recipientId,
  content,
  actionData,
}: SendDirectActionMessageArgs): Promise<{
  conversationId: string;
  messageId: string;
}> {
  const repo = await repository();
  const conversationId = await repo.getOrCreateDirectConversation(
    asUserId(recipientId),
  );
  const message = await repo.insertMessage(
    {
      conversationId: asConversationId(conversationId),
      content,
      ...(actionData !== undefined
        ? {
            action: {
              kind: actionData.kind,
              // Our senders write no version; the package reads a missing one
              // as 1, and every surface in `actions/` declares `[1]`.
              version: 1,
              // An action payload is an OBJECT — that is what the column holds
              // and what every renderer destructures. A non-object here is a
              // caller bug, and it says so rather than reaching the database as
              // something no surface can draw.
              payload: asActionPayload(actionData),
            },
          }
        : {}),
    },
    // A system notification is sent once, from one place; the idempotency key
    // still has to be real — it is what makes the insert's own response and the
    // realtime row collapse onto ONE rendered message for every reader.
    asClientMessageId(crypto.randomUUID()),
  );
  return { conversationId, messageId: message.id };
}
