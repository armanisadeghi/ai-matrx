// features/ai-work/lib/liveTranscript.ts
//
// THE ONE DECIDER for "is this mirrored conversation still being written?"
//
// A provider mirror is written by somebody else's process (the Claude Code
// plugin on the user's Mac, through the bridge) — this client never writes
// `chat.message` or `chat.tool_call` for it. So the question a live transcript
// must answer is not "did I just save?" but "is the session that feeds this
// row still delivering?". `chat.coding_session` already carries that fact:
// `status` is the binding's own lifecycle and `last_seen_at` is stamped on
// every delivered entry.
//
// Kept pure and separate from the polling hook so the window rule is testable
// and so no surface can invent a second staleness threshold — the same reason
// `captureGapVerdict()` is the one capture-gap decider.

import type { CodingSessionBinding } from "@/features/agent-connections/coding-sessions/service";

/**
 * How recently a binding must have delivered for "live" to be a PRESENT-TENSE
 * claim. Same doctrine as `syncState.ts` — a badge that says something is
 * happening NOW gets a window that means now — but wider than that panel's one
 * hour because this one drives WORK, not a health verdict: a session pausing
 * for a long model turn or an approval prompt is still live, and being wrong
 * here just means a few wasted reads rather than a false green pill.
 */
export const LIVE_SESSION_WINDOW_MS = 5 * 60 * 1000;

/** How often the transcript re-reads the newest side while a session is live. */
export const LIVE_POLL_INTERVAL_MS = 4000;

/** Ceiling for the error backoff, so a failing read never becomes a storm. */
export const LIVE_POLL_MAX_BACKOFF_MS = 30_000;

export interface LiveSessionState {
  /** True when at least one binding is active AND delivered inside the window. */
  live: boolean;
  /** Newest delivery across the conversation's bindings, ISO or null. */
  lastSeenAt: string | null;
}

function timeOf(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/**
 * Reads the conversation's own bindings and states whether its coding session
 * is still running. `status` alone is not enough: a binding stays `active`
 * after the session goes quiet (nothing closes it when Claude Code simply
 * stops), so an unbounded `status === "active"` check would poll an idle
 * mirror forever. `last_seen_at` is what makes the claim present-tense.
 */
export function liveSessionState(
  bindings: CodingSessionBinding[],
  now: number = Date.now(),
): LiveSessionState {
  let newest = Number.NEGATIVE_INFINITY;
  let live = false;

  for (const binding of bindings) {
    const seen = timeOf(binding.last_seen_at);
    if (seen > newest) newest = seen;
    if (
      binding.status === "active" &&
      binding.ended_at === null &&
      seen !== Number.NEGATIVE_INFINITY &&
      now - seen <= LIVE_SESSION_WINDOW_MS
    ) {
      live = true;
    }
  }

  return {
    live,
    lastSeenAt:
      newest === Number.NEGATIVE_INFINITY ? null : new Date(newest).toISOString(),
  };
}
