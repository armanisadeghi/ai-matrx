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
 *
 * ── PENDING GRADES ───────────────────────────────────────────────────────────
 * An attempt carrying `pendingGrade` is INCOMPLETE: it is a spoken answer whose
 * recording never uploaded and which therefore has no grade. It is not written
 * to the ledger as-is. Before step 1 the flush resolves it — upload the held
 * clip, run the grader — and records the attempt ONCE with the grade, the
 * transcript and the durable audio pointer attached. That is the only shape the
 * ledger allows: `study_record_attempt` is idempotent by id and touches nothing
 * on replay, so there is no second write to attach a grade to.
 *
 * THE RESOLVER IS INJECTED, not imported. Grading needs `fileHandler.upload` and
 * a headless agent run, which need Redux `dispatch`/`getState` — pulling those
 * in here would drag the whole client runtime into a pure service module and
 * make it unloadable from a worker or a test. So the caller that HAS a store
 * (`useOfflineStudySync`) passes a function; this module stays as it was. With
 * no resolver supplied, a held attempt records as the bare observation rather
 * than blocking the queue — degraded, and never silently: `ungraded` counts it.
 *
 * Ordering survives it. Resolution happens INSIDE the sequential loop, so a slow
 * re-grade delays the attempts behind it but can never let one overtake
 * another — the property FSRS depends on.
 */

import { studyService } from "../service/studyService";
import {
  clearPendingGrade,
  getClip,
  listPendingAttempts,
  markAttemptFailed,
  markGradeFailed,
  pruneOrphanClips,
  removeAttempt,
  removeClip,
  type OutboxAttempt,
  type PendingGradeSpec,
} from "./outbox";

/**
 * How many times one attempt may fail before it is dropped from the queue.
 * Low on purpose: the failures this guards against (id reuse, FK violation,
 * malformed payload) are permanent, and retrying them forever is what blocked
 * every answer behind them.
 */
export const MAX_ATTEMPT_RETRIES = 3;

/**
 * How many flushes may fail to GRADE a held attempt before it is recorded
 * ungraded. Deliberately higher than MAX_ATTEMPT_RETRIES: the failures this
 * guards against are mostly TRANSIENT (a flaky first minute back on signal, a
 * busy grader, an upload that times out), and giving up early throws away the
 * learner's recording — the exact loss this whole path exists to prevent. But
 * it is finite, because an answer held forever is worse than one recorded
 * ungraded: the learner's WORK would stop counting too.
 */
export const MAX_GRADE_RETRIES = 5;

/** What the flush must produce before a held attempt may reach the ledger. */
export interface ResolvedPendingGrade {
  /** Durable pointer to the learner's now-uploaded recording. */
  responseAudioFileId: string;
  result: "correct" | "partial" | "incorrect" | null;
  scoreValue: number | null;
  score: Record<string, unknown> | null;
  responseTranscript: string | null;
  /** The mandate that graded it — never an agent id. */
  gradedBy: string | null;
}

/**
 * Upload one held clip and grade it. Injected by the caller that owns a Redux
 * store; see the header. Returns null when it could not be done THIS flush
 * (transient — the attempt stays held and is retried).
 */
export type PendingGradeResolver = (job: {
  attemptId: string;
  spec: PendingGradeSpec;
  /** The held recording's raw bytes — see `OutboxClip` for why not a Blob. */
  data: ArrayBuffer;
  mimeType: string;
}) => Promise<ResolvedPendingGrade | null>;

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
  /** Held spoken answers this flush uploaded AND graded — the happy path. */
  graded: number;
  /**
   * Held spoken answers recorded WITHOUT a grade because grading kept failing
   * (or no resolver was available). The work counts; the answer content did
   * reach the server as audio when the upload succeeded. Surfaced, not hidden.
   */
  ungraded: number;
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
export function flushStudyOutbox(
  userId: string,
  resolveGrade?: PendingGradeResolver,
): Promise<FlushReport> {
  const existing = inFlight.get(userId);
  if (existing) return existing;
  const run = runFlush(userId, resolveGrade ?? null).finally(() => {
    inFlight.delete(userId);
  });
  inFlight.set(userId, run);
  return run;
}

async function runFlush(
  userId: string,
  resolveGrade: PendingGradeResolver | null,
): Promise<FlushReport> {
  const deadLettered: DeadLetteredAttempt[] = [];
  let graded = 0;
  let ungraded = 0;
  const pending = await listPendingAttempts(userId);
  if (pending.length === 0) {
    // Nothing queued still means clips can be orphaned — by a crash between
    // recording an attempt and dropping its clip. Reclaim them; a leak nobody
    // can see is a leak that eats the learner's whole budget.
    await pruneOrphanClips(userId);
    return {
      flushed: 0,
      remaining: 0,
      halted: false,
      haltReason: null,
      deadLettered,
      graded,
      ungraded,
    };
  }
  if (isOffline()) {
    return {
      flushed: 0,
      remaining: pending.length,
      halted: true,
      haltReason: "offline",
      deadLettered,
      graded,
      ungraded,
    };
  }

  let flushed = 0;
  for (let i = 0; i < pending.length; i += 1) {
    let attempt = pending[i];

    // ── Resolve a held spoken answer BEFORE it may reach the ledger ────────
    // Inside the loop, so the sequential ordering FSRS depends on is preserved
    // even when a grade takes a minute: a slow card delays the ones behind it,
    // it never lets them overtake it.
    if (attempt.pendingGrade) {
      const outcome = await resolveHeldGrade(attempt, resolveGrade);
      if (outcome.kind === "retry") {
        // Transient — leave it held and stop. Continuing past it would replay a
        // LATER attempt for the same item first.
        return {
          flushed,
          remaining: pending.length - flushed,
          halted: true,
          haltReason: outcome.reason,
          deadLettered,
          graded,
          ungraded,
        };
      }
      attempt = outcome.attempt;
      // `graded` counts GRADES, not resolutions. The resolver can succeed at
      // the half that matters most — getting the recording onto the server —
      // while the grader itself fails, and reporting that as "graded" would
      // tell the learner a grade is waiting for them that is not there.
      if (outcome.kind === "graded" && attempt.result != null) graded += 1;
      else ungraded += 1;
    }

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
        await removeClip(attempt.attemptId);
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
        graded,
        ungraded,
      };
    }

    if (attempt.seq != null) await removeAttempt(attempt.seq);
    // The recording is now on the server (or was never keepable). Either way the
    // local copy has done its job — hold it any longer and it is dead weight.
    await removeClip(attempt.attemptId);
    flushed += 1;

    // A disconnect mid-drain leaves the rest queued for the next flush.
    if (isOffline() && i < pending.length - 1) {
      return {
        flushed,
        remaining: pending.length - flushed,
        halted: true,
        haltReason: "offline",
        deadLettered,
        graded,
        ungraded,
      };
    }
  }

  await pruneOrphanClips(userId);
  return {
    flushed,
    remaining: 0,
    halted: false,
    haltReason: null,
    deadLettered,
    graded,
    ungraded,
  };
}

type HeldOutcome =
  | { kind: "graded"; attempt: OutboxAttempt }
  | { kind: "ungraded"; attempt: OutboxAttempt }
  | { kind: "retry"; reason: string };

/**
 * Turn a held spoken attempt into a recordable one.
 *
 * Three ways out, and the third is the one that matters:
 *   • graded  — the clip uploaded and the grader answered. The attempt gains the
 *               audio pointer, the grade, the transcript and the mandate that
 *               produced it, and is recorded ONCE, complete.
 *   • retry   — a transient failure. The attempt stays held WITH its clip, the
 *               flush halts (ordering), and the next flush tries again.
 *   • ungraded— we gave up: no resolver at all, the clip is gone, or grading has
 *               failed MAX_GRADE_RETRIES times. `pendingGrade` is cleared and it
 *               records as the bare observation. The learner's WORK still counts.
 *
 * It never fabricates a grade. An attempt that could not be graded records with
 * `result` exactly as it was captured — null.
 */
async function resolveHeldGrade(
  attempt: OutboxAttempt,
  resolveGrade: PendingGradeResolver | null,
): Promise<HeldOutcome> {
  const spec = attempt.pendingGrade;
  const release = async (): Promise<OutboxAttempt> => {
    if (attempt.seq != null) await clearPendingGrade(attempt.seq);
    await removeClip(attempt.attemptId);
    return { ...attempt, pendingGrade: null };
  };

  if (!spec) return { kind: "ungraded", attempt };

  // No store to grade with (a worker, a test, a caller without Redux). Recording
  // the observation is right — blocking the whole queue on a capability this
  // caller does not have would cost every answer behind it.
  if (!resolveGrade) return { kind: "ungraded", attempt: await release() };

  const held = await getClip(attempt.attemptId);
  if (!held || held.data.byteLength === 0) {
    // The clip is gone — evicted, cleared, or lost to a browser wiping storage.
    // Nothing to grade and nothing to upload; the answer content is already
    // lost, so hold it no longer.
    return { kind: "ungraded", attempt: await release() };
  }

  const resolved = await resolveGrade({
    attemptId: attempt.attemptId,
    spec,
    data: held.data,
    mimeType: held.mimeType,
  });

  if (resolved) {
    if (attempt.seq != null) await clearPendingGrade(attempt.seq);
    return {
      kind: "graded",
      attempt: {
        ...attempt,
        pendingGrade: null,
        responseAudioFileId: resolved.responseAudioFileId,
        result: resolved.result,
        scoreValue: resolved.scoreValue,
        score: resolved.score,
        responseTranscript: resolved.responseTranscript,
        gradedBy: resolved.gradedBy,
      },
    };
  }

  const failures =
    attempt.seq != null
      ? await markGradeFailed(attempt.seq)
      : MAX_GRADE_RETRIES;
  if (failures >= MAX_GRADE_RETRIES) {
    return { kind: "ungraded", attempt: await release() };
  }
  return {
    kind: "retry",
    reason: `Could not grade an offline answer yet (attempt ${failures} of ${MAX_GRADE_RETRIES}).`,
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
    // `?? null` rather than a bare read: rows queued before these columns
    // existed carry `undefined`, and an explicit null is what the RPC expects.
    responseAudioFileId: attempt.responseAudioFileId ?? null,
    responseImageFileId: attempt.responseImageFileId ?? null,
    gradedBy: attempt.gradedBy ?? null,
    latencyMs: attempt.latencyMs,
    // The two fields that make replay safe and correctly scheduled.
    attemptId: attempt.attemptId,
    reviewedAt: attempt.capturedAt,
  };
}
