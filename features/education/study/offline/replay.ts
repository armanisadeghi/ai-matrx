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

/**
 * How many times one attempt may fail before it is dropped from the queue.
 * Low on purpose: the failures this guards against (id reuse, FK violation,
 * malformed payload) are permanent, and retrying them forever is what blocked
 * every answer behind them.
 */
export const MAX_ATTEMPT_RETRIES = 3;

export interface DeadLetteredAttempt {
  attemptId: string;
  reason: string;
}

export interface FlushReport {
  /** Attempts the server durably accepted (including idempotent replays). */
  flushed: number;
  /** Attempts still queued when the flush stopped. */
  remaining: number;
  /** True when the flush halted early (offline / server error). */
  halted: boolean;
  /** The error that halted it, for surfacing — never swallowed. */
  haltReason: string | null;
  /**
   * Attempts permanently dropped this flush. These are LOST ANSWERS — the
   * caller must tell the learner, never quietly discard them.
   */
  deadLettered: DeadLetteredAttempt[];
}

/**
 * In-flight flushes, keyed BY USER. A single module-level slot meant a flush
 * for user B started while user A's was running returned A's promise and
 * silently no-opped B's queue.
 */
const inFlight = new Map<string, Promise<FlushReport>>();

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Drain the outbox for one user. Concurrent calls FOR THE SAME USER share one
 * flush — two `online` events firing together must not replay in parallel
 * (idempotency makes that safe at the DB, but it wastes a round trip per item
 * and interleaves the ordering the algorithm depends on).
 */
export function flushStudyOutbox(userId: string): Promise<FlushReport> {
  const existing = inFlight.get(userId);
  if (existing) return existing;
  const run = runFlush(userId).finally(() => {
    inFlight.delete(userId);
  });
  inFlight.set(userId, run);
  return run;
}

async function runFlush(userId: string): Promise<FlushReport> {
  const deadLettered: DeadLetteredAttempt[] = [];
  const pending = await listPendingAttempts(userId);
  if (pending.length === 0) {
    return {
      flushed: 0,
      remaining: 0,
      halted: false,
      haltReason: null,
      deadLettered,
    };
  }
  if (isOffline()) {
    return {
      flushed: 0,
      remaining: pending.length,
      halted: true,
      haltReason: "offline",
      deadLettered,
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

      // A PERMANENTLY failing head item used to poison the whole queue: every
      // later flush retried it, halted on it again, and nothing behind it ever
      // reached the server. Some refusals are permanent by nature — the RPC's
      // id-reuse refusal, a foreign-key violation, a malformed attempt — and no
      // number of retries fixes them. After MAX_ATTEMPT_RETRIES we drop that ONE
      // attempt to the dead-letter list and carry on, so one bad row costs one
      // answer instead of every answer after it.
      const failures = attempt.failedAttempts + 1;
      if (attempt.seq != null && failures >= MAX_ATTEMPT_RETRIES) {
        deadLettered.push({ attemptId: attempt.attemptId, reason: message });
        await removeAttempt(attempt.seq);
        continue;
      }

      // Otherwise halt: a later attempt for the SAME item must never replay
      // before an earlier one, because FSRS state is sequential.
      return {
        flushed,
        remaining: pending.length - flushed,
        halted: true,
        haltReason: message,
        deadLettered,
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
        deadLettered,
      };
    }
  }

  return {
    flushed,
    remaining: 0,
    halted: false,
    haltReason: null,
    deadLettered,
  };
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
