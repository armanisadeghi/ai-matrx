/**
 * features/education/study/offline/replay.ts
 *
 * Flush the offline outbox into the study spine — IC-8 §3.
 *
 * The algorithm, and why each step is the way it is:
 *
 *   For each queued attempt, IN CAPTURE ORDER:
 *     1. Call `studyService.recordAttempt` with the captured observation plus
 *        `attemptId` (the idempotency key) and `reviewedAt` (`capturedAt`).
 *     2. recordAttempt reads the item's CURRENT mastery and derives FSRS from
 *        it using `reviewedAt` as the review instant — so scheduling reflects
 *        when the learner answered and the state it actually followed.
 *     3. On success, drop the row from the queue.
 *     4. On network death, STOP — everything from here stays queued and the
 *        next flush resumes from it. Resuming is safe precisely because a
 *        replayed `attemptId` returns the existing attempt without touching
 *        mastery, so an attempt whose response we never saw cannot double-count.
 *
 * Order matters because FSRS state is sequential: replaying card A's second
 * review before its first would schedule from the wrong prior state. A failure
 * on one item therefore halts the whole flush rather than skipping ahead.
 *
 * This module never throws into a caller: a flush is best-effort background
 * work, and a queue that cannot drain must stay visible (via
 * `countPendingAttempts`) rather than disappear.
 */

import { studyService } from "../service/studyService";
import {
  listPendingAttempts,
  markAttemptFailed,
  removeAttempt,
  type OutboxAttempt,
} from "./outbox";

export interface FlushReport {
  /** Attempts the server durably accepted (including idempotent replays). */
  flushed: number;
  /** Attempts still queued when the flush stopped. */
  remaining: number;
  /** True when the flush halted early (offline / server error). */
  halted: boolean;
  /** The error that halted it, for surfacing — never swallowed. */
  haltReason: string | null;
}

let inFlight: Promise<FlushReport> | null = null;

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Drain the outbox for one user. Concurrent calls share one flush — two
 * `online` events firing together must not replay the queue twice in parallel
 * (idempotency makes that safe at the DB, but it wastes a round trip per item
 * and interleaves the ordering the algorithm depends on).
 */
export function flushStudyOutbox(userId: string): Promise<FlushReport> {
  if (inFlight) return inFlight;
  inFlight = runFlush(userId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runFlush(userId: string): Promise<FlushReport> {
  const pending = await listPendingAttempts(userId);
  if (pending.length === 0) {
    return { flushed: 0, remaining: 0, halted: false, haltReason: null };
  }
  if (isOffline()) {
    return {
      flushed: 0,
      remaining: pending.length,
      halted: true,
      haltReason: "offline",
    };
  }

  let flushed = 0;
  for (let i = 0; i < pending.length; i += 1) {
    const attempt = pending[i];
    const result = await studyService.recordAttempt(toInput(attempt));

    if (result.error) {
      const message = String(result.error);
      if (attempt.seq != null) {
        await markAttemptFailed(attempt.seq, message);
      }
      // Halt: the remaining attempts for this item depend on this one's state.
      return {
        flushed,
        remaining: pending.length - flushed,
        halted: true,
        haltReason: message,
      };
    }

    if (attempt.seq != null) await removeAttempt(attempt.seq);
    flushed += 1;

    // A disconnect mid-drain leaves the rest queued for the next flush.
    if (isOffline() && i < pending.length - 1) {
      return {
        flushed,
        remaining: pending.length - flushed,
        halted: true,
        haltReason: "offline",
      };
    }
  }

  return { flushed, remaining: 0, halted: false, haltReason: null };
}

function toInput(attempt: OutboxAttempt) {
  return {
    itemType: attempt.itemType,
    itemId: attempt.itemId,
    sessionId: attempt.sessionId,
    ...(attempt.method != null ? { method: attempt.method } : {}),
    ...(attempt.result != null ? { result: attempt.result } : {}),
    confidence: attempt.confidence,
    score: attempt.score,
    scoreValue: attempt.scoreValue,
    responseKind: attempt.responseKind,
    responseTranscript: attempt.responseTranscript,
    latencyMs: attempt.latencyMs,
    // The two fields that make replay safe and correctly scheduled.
    attemptId: attempt.attemptId,
    reviewedAt: attempt.capturedAt,
  };
}
