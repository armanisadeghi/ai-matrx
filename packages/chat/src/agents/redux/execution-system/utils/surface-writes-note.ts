/**
 * THE LABEL ON A POST-WRITE PAGE RE-READ.
 *
 * `resumeInstance` re-reads the live page before the loop continues (ARE-010,
 * 2026-09-26: the launch-time snapshot told the agent an approved change never
 * landed). That fixed "stale", and opened the mirror image (2026-09-27,
 * /hr/settings/employer): the fresh page values ALREADY show the agent's own
 * write, and nothing said they were read after it — so the model told the
 * person the establishments "already existed" and the declaration "was already
 * there", although each write landed exactly once.
 *
 * This builds the context entry that travels with the resumed request and says
 * so: the page values were re-read at <time>, after these writes this
 * conversation made. Built from the tool lifecycle already in Redux (every
 * `apply_surface_write` result lands there through `dispatchSurfaceWrite`'s
 * `finish`), so there is no second record of what was written.
 */

import {
  DEFAULT_SURFACE_KEY,
  type ContextRowSource,
} from "@ai-matrx/agents/context";
import type { RootState } from "@host/lib/redux/store";

/** The context key the resumed request carries the note under. */
export const SURFACE_WRITES_NOTE_KEY = "page_values_read_after_your_writes";

/** At most this many writes are listed (newest kept). */
const MAX_LISTED_WRITES = 10;
const MAX_MESSAGE_CHARS = 300;
/** Ten listed writes at 300 chars each plus the framing fit under this. */
const NOTE_INLINE_CEILING = 4000;

interface ListedWrite {
  target: string;
  appliedAt: string;
  message: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Every successful `apply_surface_write` this conversation made, oldest first,
 * as the resumed request should name them. Empty when there are none.
 */
export function selectSuccessfulSurfaceWrites(
  state: RootState,
  conversationId: string,
): ListedWrite[] {
  const requestIds = state.activeRequests.byConversationId[conversationId] ?? [];
  const writes: ListedWrite[] = [];
  for (const requestId of requestIds) {
    const request = state.activeRequests.byRequestId[requestId];
    if (!request) continue;
    for (const entry of Object.values(request.toolLifecycle)) {
      if (entry.toolName !== "apply_surface_write" || entry.status !== "completed") continue;
      const result = asRecord(entry.result);
      if (!result || result.ok !== true) continue;
      const message = typeof result.message === "string" ? result.message : "";
      writes.push({
        target: typeof result.target === "string" ? result.target : "a page value",
        appliedAt:
          typeof result.applied_at === "string"
            ? result.applied_at
            : (entry.completedAt ?? entry.startedAt),
        message:
          message.length > MAX_MESSAGE_CHARS
            ? `${message.slice(0, MAX_MESSAGE_CHARS - 1)}…`
            : message,
      });
    }
  }
  writes.sort((a, b) => a.appliedAt.localeCompare(b.appliedAt));
  return writes.slice(-MAX_LISTED_WRITES);
}

/**
 * The note for a resumed request whose page values were just re-read, or
 * `null` when this conversation made no successful page write.
 */
export function buildSurfaceWritesNote(
  state: RootState,
  conversationId: string,
  readAt: string = new Date().toISOString(),
): string | null {
  const writes = selectSuccessfulSurfaceWrites(state, conversationId);
  if (writes.length === 0) return null;
  const lines = writes.map(
    (w, i) => `${i + 1}. ${w.target} at ${w.appliedAt}${w.message ? ` — ${w.message}` : ""}`,
  );
  return (
    `The page values in this context were re-read at ${readAt}, AFTER these writes you made in this conversation:\n` +
    `${lines.join("\n")}\n` +
    `Anything those writes created or changed appears in the page values because of them. It did not exist ` +
    `before your write — report it to the user as done by you just now, never as already there, and do not write it again.`
  );
}

/**
 * The writes note as one more context VALUE for the resumed request — a row
 * of the one door (`buildRequestContext`'s `extraSources`), so the person sees
 * and governs it like any other value. Null when this conversation made no
 * page write.
 */
export function surfaceWritesNoteSource(
  state: RootState,
  conversationId: string,
  readAt?: string,
): ContextRowSource | null {
  const writesNote = buildSurfaceWritesNote(state, conversationId, readAt);
  if (!writesNote) return null;
  const envelope = surfaceWritesNoteEnvelope(writesNote);
  return {
    key: SURFACE_WRITES_NOTE_KEY,
    label: envelope.label as string,
    surfaceKey: DEFAULT_SURFACE_KEY,
    origin: "system",
    value: envelope,
    type: "text",
    // The note only works when it is in front of the model.
    layers: { surface: { declared: false, max_inline_chars: NOTE_INLINE_CEILING } },
  };
}

/**
 * The note as a wire envelope with an inline ceiling. A bare string was listed
 * by the server as a DEFERRED key (name only, "fetch on demand"), so the model
 * never read it unless it chose to look (found live 2026-09-27); the note only
 * works when it is in front of the model.
 */
export function surfaceWritesNoteEnvelope(note: string): Record<string, unknown> {
  return {
    content: note,
    type: "text",
    label: "Page values read after your writes",
    max_inline_chars: NOTE_INLINE_CEILING,
  };
}
