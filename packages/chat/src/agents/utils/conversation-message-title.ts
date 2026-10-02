/**
 * Canonical title derivation for anything created FROM a chat message —
 * notes, tasks, documents, files. One contract everywhere:
 *
 *   "{conversation title} Message {n}"   (n is 1-based)
 *
 * Falls back to the bare conversation title when the position is unknown,
 * and to `undefined` when the conversation has no label — callers supply
 * their own destination-appropriate fallback (timestamp name, cleaned first
 * line, etc.). Never derive a title from raw message content when the
 * conversation label exists.
 *
 * Read the title with `selectConversationTitle` and the position with
 * `selectMessagePosition` (features/agents/redux/execution-system).
 */

export function buildConversationMessageTitle(
  conversationTitle: string | null | undefined,
  messagePosition: number | null | undefined,
): string | undefined {
  const title = conversationTitle?.trim();
  if (!title) return undefined;

  if (
    messagePosition == null ||
    !Number.isFinite(messagePosition) ||
    messagePosition < 0
  ) {
    return title;
  }

  return `${title} Message ${messagePosition + 1}`;
}
