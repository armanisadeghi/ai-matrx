/**
 * features/education/study/offline/recordAttemptOffline.ts
 *
 * The offline-tolerant wrapper around the ONE attempt writer.
 *
 * Every study mode funnels through `studyService.recordAttempt` — but that is a
 * statement about the SERVICE, not about this wrapper, and for a year the two
 * were confused. Calling the service directly still reaches the spine online
 * and still LOSES the answer offline; only this wrapper queues it. So the rule
 * is: **a study mode calls `recordAttemptOfflineAware`, never
 * `studyService.recordAttempt`.** Direct service calls belong to the replay
 * loop (which is already the offline path) and to server-side/admin writers.
 *
 * Current in-app callers, all seven study modes:
 *   classic review / Learn / Write  → `flashcards/data/useFlashcardStudy.ts`
 *   Test (multiple choice)          → `flashcards/data/useQuizStudy.ts`
 *   Due review                      → `flashcards/data/useDueReview.ts`
 *   Weak-area drill                 → `flashcards/data/useWeakAreaDrill.ts`
 *   Match                           → `flashcards/data/useMatchGame.ts`
 *   FastFire                        → `flashcards/fast-fire/agents/gradeCard.thunk.ts`
 *   Voice test                      → `flashcards/fast-fire/agents/gradeSpokenAnswer.thunk.ts`
 *
 * The wrapper is LOSSLESS: every field of `RecordAttemptInput` that describes
 * what the learner did survives the queue. Anything this file forgets to carry
 * is silently destroyed on the offline path only, which is the hardest class of
 * bug to notice — so add new observation fields HERE and in `outbox.ts`
 * together, never to the online path alone.
 *
 * Behaviour:
 *   • Online, RPC succeeds → the real result, unchanged. `queued` is false.
 *   • Offline, or the RPC fails for a NETWORK reason → the observation is
 *     queued (IC-8) and `queued` is true with the caller's optimistic view.
 *   • The RPC fails for a NON-network reason (auth, validation, RLS) → that is
 *     a real error and is returned as one. Queuing a request the server
 *     actively refused would retry it forever and hide a genuine bug.
 *   • A caller passing a `PendingGradeRequest` (the SPOKEN modes, whose grade
 *     comes from a server agent and whose clip could not upload) gets the
 *     HOLD-BACK: the clip and the grader's inputs are stored and the attempt is
 *     queued INCOMPLETE, never written to the ledger now. The flush uploads,
 *     grades, and records it ONCE, complete. See `replay.ts`.
 *
 * The attempt id is generated HERE, before the call, so the same id is used
 * whether the write lands now or is replayed later — that is what makes the
 * "did my answer save?" question answerable exactly once.
 */

import { studyService } from "../service/studyService";
import type { ItemMasteryRow, RecordAttemptInput } from "../types";
import {
  enqueueAttempt,
  isOutboxAvailable,
  readClipBytes,
  removeClip,
  storeClip,
  type ClipRejection,
  type PendingGradeSpec,
} from "./outbox";

export interface OfflineAwareAttemptResult {
  attemptId: string;
  /** The server's mastery row, or null when the attempt is queued offline. */
  mastery: ItemMasteryRow | null;
  /** True when this answer is in the outbox awaiting reconnect. */
  queued: boolean;
  /**
   * True when the attempt is queued AND deliberately HELD BACK from the ledger
   * until the flush can upload its recording and grade it. The learner's answer
   * content survives in this case; `queued && !heldForGrade` means the
   * observation survived but the recording did not.
   */
  heldForGrade: boolean;
  /**
   * Why the recording could not be held, when one was offered and refused.
   * The caller MUST surface this — a learner whose recording we dropped is
   * being told "saved" about half of what they did.
   */
  clipRejection: ClipRejection | null;
  /** Set only when the answer could NOT be recorded or queued at all. */
  error: string | null;
}

/**
 * The pending-grade half of the call: the learner's raw recording plus the
 * grader inputs needed to reproduce, at reconnect, the run that could not
 * happen now. Supplying both is what asks for the HOLD-BACK.
 */
export interface PendingGradeRequest {
  spec: PendingGradeSpec;
  clip: Blob;
}

/**
 * A failure that means "the network is gone", as opposed to "the server
 * refused this". Supabase surfaces transport failures as a TypeError from
 * fetch ("Failed to fetch" / "NetworkError" / "Load failed" on Safari), while
 * a refusal arrives as a PostgrestError with a code.
 *
 * Exported because the offline READ path (`features/flashcards/data/offlineDeck.ts`)
 * needs the identical distinction: a deck fetch that failed because the network
 * is gone should fall back to the downloaded snapshot, while a fetch the server
 * actively refused (RLS, deleted set) must surface as the error it is. A second
 * copy of this predicate would drift the moment one browser's wording changed.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error != null && "message" in error
          ? String((error as { message: unknown }).message)
          : "";
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(
    message,
  );
}

export async function recordAttemptOfflineAware(
  input: RecordAttemptInput & { userId: string },
  pending?: PendingGradeRequest | null,
): Promise<OfflineAwareAttemptResult> {
  const { userId, ...attempt } = input;
  const attemptId = attempt.attemptId ?? crypto.randomUUID();
  const capturedAt = attempt.reviewedAt ?? new Date().toISOString();

  // ── THE HOLD-BACK ────────────────────────────────────────────────────────
  // A caller offering a clip is telling us the answer is INCOMPLETE: the
  // recording never uploaded, so no grade exists and none can be attached
  // later. `study_record_attempt` is idempotent BY ID and touches nothing on
  // replay, and the only other write — `study_override_attempt` — stamps
  // `is_manually_edited`/`edited_by` (branding an AI grade as the learner's own
  // manual correction, the flag contest integrity depends on) and cannot carry
  // `response_audio_file_id`, `response_transcript` or `graded_by` at all. So
  // the row is written ONCE, complete, after the flush grades it.
  //
  // This runs BEFORE the online branch on purpose. `navigator.onLine` can be
  // true on a connection healthy enough for the RPC and not for a multi-megabyte
  // upload; letting the ledger row land in that window is exactly how the
  // recording gets orphaned with no way back.
  let clipRejection: ClipRejection | null = null;
  if (pending && pending.clip.size > 0) {
    if (isOutboxAvailable()) {
      const data = await readClipBytes(pending.clip);
      const stored = data
        ? await storeClip({
            attemptId,
            userId,
            data,
            mimeType: pending.clip.type || "audio/wav",
            bytes: data.byteLength,
          })
        : ({ stored: false, reason: "write-failed" } as const);
      if (stored.stored) {
        const queuedHeld = await enqueueAttempt(
          toOutboxRow(userId, attemptId, capturedAt, attempt, pending.spec),
        );
        if (queuedHeld) {
          return {
            attemptId,
            mastery: null,
            queued: true,
            heldForGrade: true,
            clipRejection: null,
            error: null,
          };
        }
        // The clip landed but the attempt it belongs to did not — that clip is
        // now an orphan by construction, so drop it here rather than leaving it
        // to `pruneOrphanClips` to find later.
        await removeClip(attemptId);
        clipRejection = "write-failed";
      } else {
        clipRejection = stored.reason;
      }
    } else {
      clipRejection = "unavailable";
    }
    // Fall through: the recording could not be held, but the OBSERVATION still
    // counts and takes the ordinary path below. Never worse than before this
    // capability existed — and the caller is told, via `clipRejection`.
  }

  const offlineNow =
    typeof navigator !== "undefined" && navigator.onLine === false;

  if (!offlineNow) {
    const result = await studyService.recordAttempt({ ...attempt, attemptId });
    // StudyResult is not a discriminated union, so `data` must be checked
    // directly — a null-error/null-data result would otherwise read as success.
    if (!result.error && result.data) {
      return {
        attemptId: result.data.attemptId,
        mastery: result.data.mastery,
        queued: false,
        heldForGrade: false,
        clipRejection,
        error: null,
      };
    }
    if (result.error && !isNetworkFailure(result.error)) {
      // A real refusal — surface it. Never queue what the server rejected.
      return {
        attemptId,
        mastery: null,
        queued: false,
        heldForGrade: false,
        clipRejection,
        error: String(result.error),
      };
    }
  }

  if (!isOutboxAvailable()) {
    return {
      attemptId,
      mastery: null,
      queued: false,
      heldForGrade: false,
      clipRejection,
      error:
        "This answer could not be saved — offline storage is unavailable in this browser.",
    };
  }

  const queued = await enqueueAttempt(
    toOutboxRow(userId, attemptId, capturedAt, attempt, null),
  );

  if (!queued) {
    return {
      attemptId,
      mastery: null,
      queued: false,
      heldForGrade: false,
      clipRejection,
      error: "This answer could not be saved offline.",
    };
  }

  return {
    attemptId,
    mastery: null,
    queued: true,
    heldForGrade: false,
    clipRejection,
    error: null,
  };
}

/**
 * The ONE place an outbox row is built from a `RecordAttemptInput`. Both queue
 * paths (held-for-grade and ordinary) go through it, because the lossy-wrapper
 * bug was exactly a field carried on one path and forgotten on the other.
 */
function toOutboxRow(
  userId: string,
  attemptId: string,
  capturedAt: string,
  attempt: Omit<RecordAttemptInput, never>,
  pendingGrade: PendingGradeSpec | null,
) {
  return {
    attemptId,
    userId,
    itemType: attempt.itemType,
    itemId: attempt.itemId,
    sessionId: attempt.sessionId ?? null,
    method: attempt.method ?? null,
    result: attempt.result ?? null,
    confidence: attempt.confidence ?? null,
    score: attempt.score ?? null,
    scoreValue: attempt.scoreValue ?? null,
    responseKind: attempt.responseKind ?? null,
    responseTranscript: attempt.responseTranscript ?? null,
    responseAudioFileId: attempt.responseAudioFileId ?? null,
    responseImageFileId: attempt.responseImageFileId ?? null,
    gradedBy: attempt.gradedBy ?? null,
    latencyMs: attempt.latencyMs ?? null,
    capturedAt,
    pendingGrade,
    gradeFailures: 0,
  };
}
