/**
 * Transcript journal — a bounded, in-memory record of every structural
 * mutation the messages slice makes to a conversation's spine.
 *
 * Why this exists: "the user message doesn't show" has been reported and
 * "fixed" several times without anyone being able to say WHICH write path
 * produced the transcript the person was looking at. The slice has six ways
 * to change the spine (optimistic add, promote, reserve, hydrate, prepend,
 * remove/clear) and three thunks plus the stream processor drive them. The
 * journal turns "it happened again" into a copyable sequence of facts.
 *
 * Contract:
 *   - Append-only, per conversation, bounded (`MAX_EVENTS_PER_CONVERSATION`).
 *   - Written by the slice reducers. It is a plain module-level buffer (no
 *     state, no subscribers, no React), so recording is a side effect the
 *     reducer performs exactly once per dispatch — Redux never replays a
 *     reducer for the same action.
 *   - Read ONLY by the admin transcript-integrity report
 *     (`components/messages-display/transcript-integrity-report.ts`).
 *   - Never carries message bodies — ids, roles, positions, counts and short
 *     previews only, so the copy stays small and safe to paste anywhere.
 */

export type TranscriptJournalKind =
  | "optimistic_user_added"
  | "optimistic_user_duplicate_ignored"
  | "message_reserved"
  | "message_reserved_duplicate_ignored"
  | "promote"
  | "promote_merged_into_existing"
  | "promote_missing_old_id"
  | "hydrate"
  | "prepend"
  | "remove"
  | "clear"
  | "visible_group_limit"
  | "user_bubble_rendered_empty"
  | "user_bubble_hidden_host_authored";

export interface TranscriptJournalEvent {
  at: string;
  kind: TranscriptJournalKind;
  /** Compact facts; never a message body. */
  detail: Record<string, string | number | boolean | null | string[]>;
}

const MAX_EVENTS_PER_CONVERSATION = 120;
const MAX_CONVERSATIONS = 40;

const journal = new Map<string, TranscriptJournalEvent[]>();

export function recordTranscriptEvent(
  conversationId: string,
  kind: TranscriptJournalKind,
  detail: TranscriptJournalEvent["detail"] = {},
): void {
  let events = journal.get(conversationId);
  if (!events) {
    if (journal.size >= MAX_CONVERSATIONS) {
      const oldest = journal.keys().next().value;
      if (oldest !== undefined) journal.delete(oldest);
    }
    events = [];
    journal.set(conversationId, events);
  }
  events.push({ at: new Date().toISOString(), kind, detail });
  if (events.length > MAX_EVENTS_PER_CONVERSATION) {
    events.splice(0, events.length - MAX_EVENTS_PER_CONVERSATION);
  }
}

export function readTranscriptJournal(
  conversationId: string,
): TranscriptJournalEvent[] {
  return journal.get(conversationId)?.slice() ?? [];
}

/** Test-only reset. */
export function clearTranscriptJournal(conversationId?: string): void {
  if (conversationId) journal.delete(conversationId);
  else journal.clear();
}

/** Short id for journal / report lines — enough to correlate, never the whole UUID. */
export function shortId(id: string | null | undefined): string {
  if (!id) return "";
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
