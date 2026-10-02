/**
 * Conversation ID integrity guard.
 *
 * The client generates `conversationId` up-front and sends it to the server.
 * The server MUST honor that id — every signal that carries a conversation id
 * back (X-Conversation-ID header, typed "conversation_id" data event,
 * record_reserved for cx_conversation) is expected to equal the local id.
 *
 * If they ever diverge, that is a server bug to fix, not a client state to
 * work around. In development we throw loudly; in production we log and
 * continue using the local id.
 */

export type ConversationIdSource =
  | "x-conversation-id-header"
  | "conversation_id-data-event"
  | "record_reserved-cx_conversation";

export function assertConversationIdMatches(
  localConversationId: string,
  incomingId: string | null | undefined,
  source: ConversationIdSource,
): void {
  if (!incomingId) return;
  if (incomingId === localConversationId) return;

  const message =
    `[conversation-id drift] server returned a different conversation id via ${source}. ` +
    `local=${localConversationId} incoming=${incomingId}. ` +
    `The server must honor the client-generated conversation id.`;

  if (process.env.NODE_ENV !== "production") {
    throw new Error(message);
  }
  console.error(message);
}
