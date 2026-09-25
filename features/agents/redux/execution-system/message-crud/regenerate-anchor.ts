// regenerate-anchor — which question a "Regenerate" re-asks. Light (no thunks,
// no network) so the action registry can decide visibility synchronously.
// The thunk that acts on it lives in ./regenerate-answer.

import type { RootState } from "@/lib/redux/store";

export interface RegenerateAnchorInput {
  id: string;
  role: string;
  position: number;
  deletedAt?: string | null;
}

/**
 * `userMessageId/userPosition` null = the question sits BEFORE the loaded
 * window (the chat loads the newest rows only); the thunk reads its position
 * from the database before acting.
 */
export type RegenerateAnchor =
  | { userMessageId: string; userPosition: number }
  | { userMessageId: null; userPosition: null };

/**
 * The question to regenerate from, or null when `assistantMessageId` is not
 * part of the conversation's LAST turn (or is not an assistant message).
 */
export function findRegenerateAnchor(
  messages: RegenerateAnchorInput[],
  assistantMessageId: string,
): RegenerateAnchor | null {
  const live = messages
    .filter((m) => !m.deletedAt)
    .sort((a, b) => a.position - b.position);
  const target = live.find((m) => m.id === assistantMessageId);
  if (!target || target.role !== "assistant") return null;
  let lastUser: RegenerateAnchorInput | undefined;
  for (const m of live) if (m.role === "user") lastUser = m;
  // No question in the loaded window: every loaded row belongs to the latest
  // turn, so the target is in it — the question precedes the window.
  if (!lastUser) return { userMessageId: null, userPosition: null };
  if (target.position <= lastUser.position) return null;
  return { userMessageId: lastUser.id, userPosition: lastUser.position };
}

/** Anchor lookup against the live Redux transcript. */
export function selectRegenerateAnchor(
  state: RootState,
  conversationId: string,
  assistantMessageId: string,
): RegenerateAnchor | null {
  const entry = state.messages.byConversationId[conversationId];
  if (!entry) return null;
  const rows = entry.orderedIds
    .map((id) => entry.byId[id])
    .filter(Boolean)
    .map((m) => ({
      id: m.id,
      role: String(m.role),
      position: typeof m.position === "number" ? m.position : 0,
      deletedAt: m.deletedAt ?? null,
    }));
  return findRegenerateAnchor(rows, assistantMessageId);
}
