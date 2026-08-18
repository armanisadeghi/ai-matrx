// features/vision-interview/pendingAnswersStorage.ts
//
// Durable storage for the "ready to send" answer ledger.
//
// THE LAW (workspace CLAUDE.md § never ask whether something should persist):
// an answer the Expert wrote is content, and content is never lost to a
// reload, a crash, or a deploy. The per-question DRAFT inside the answer
// window is already durable via `useDurableDraft`; without this, the ledger
// that says "these are ready to ride the next message" was in-memory only, so
// after F5 a Pending card read Open again while its text still existed — the
// two halves disagreed, which is worse than either.
//
// Keyed per session so two interviews never bleed into each other. Cleared
// only when the answers durably rode a message (`pendingAnswersCleared`).

import type { PendingAnswer } from "./redux/vision-interview.slice";

const KEY_PREFIX = "vision-interview:pending-answers:";

const keyFor = (sessionId: string) => `${KEY_PREFIX}${sessionId}`;

/** SSR-safe, quota-safe, corruption-safe: storage never breaks the room. */
export function loadPendingAnswers(
  sessionId: string,
): Record<string, PendingAnswer> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(keyFor(sessionId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, PendingAnswer> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Partial<PendingAnswer>;
      if (
        typeof v.questionId === "string" &&
        typeof v.questionText === "string" &&
        typeof v.answerText === "string" &&
        v.answerText.trim()
      ) {
        out[id] = {
          questionId: v.questionId,
          questionText: v.questionText,
          answerText: v.answerText,
          updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : 0,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function savePendingAnswers(
  sessionId: string | null,
  answers: Record<string, PendingAnswer>,
): void {
  if (!sessionId || typeof window === "undefined") return;
  try {
    if (Object.keys(answers).length === 0) {
      window.localStorage.removeItem(keyFor(sessionId));
      return;
    }
    window.localStorage.setItem(keyFor(sessionId), JSON.stringify(answers));
  } catch {
    // A full/blocked localStorage must never break answering — the in-memory
    // ledger still rides the next message.
  }
}
