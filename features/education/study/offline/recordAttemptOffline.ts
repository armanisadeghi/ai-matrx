/**
 * features/education/study/offline/recordAttemptOffline.ts
 *
 * The offline-tolerant wrapper around the ONE attempt writer.
 *
 * Every study mode already funnels through `studyService.recordAttempt`, so
 * offline support belongs in one wrapper here rather than in each mode — a
 * second capture path per mode is exactly the duplication the study spine
 * exists to prevent.
 *
 * Behaviour:
 *   • Online, RPC succeeds → the real result, unchanged. `queued` is false.
 *   • Offline, or the RPC fails for a NETWORK reason → the observation is
 *     queued (IC-8) and `queued` is true with the caller's optimistic view.
 *   • The RPC fails for a NON-network reason (auth, validation, RLS) → that is
 *     a real error and is returned as one. Queuing a request the server
 *     actively refused would retry it forever and hide a genuine bug.
 *
 * The attempt id is generated HERE, before the call, so the same id is used
 * whether the write lands now or is replayed later — that is what makes the
 * "did my answer save?" question answerable exactly once.
 */

import { studyService } from "../service/studyService";
import type { ItemMasteryRow, RecordAttemptInput } from "../types";
import { enqueueAttempt, isOutboxAvailable } from "./outbox";

export interface OfflineAwareAttemptResult {
  attemptId: string;
  /** The server's mastery row, or null when the attempt is queued offline. */
  mastery: ItemMasteryRow | null;
  /** True when this answer is in the outbox awaiting reconnect. */
  queued: boolean;
  /** Set only when the answer could NOT be recorded or queued at all. */
  error: string | null;
}

/**
 * A failure that means "the network is gone", as opposed to "the server
 * refused this". Supabase surfaces transport failures as a TypeError from
 * fetch ("Failed to fetch" / "NetworkError" / "Load failed" on Safari), while
 * a refusal arrives as a PostgrestError with a code.
 */
function isNetworkFailure(error: unknown): boolean {
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
): Promise<OfflineAwareAttemptResult> {
  const { userId, ...attempt } = input;
  const attemptId = attempt.attemptId ?? crypto.randomUUID();
  const capturedAt = attempt.reviewedAt ?? new Date().toISOString();

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
        error: null,
      };
    }
    if (result.error && !isNetworkFailure(result.error)) {
      // A real refusal — surface it. Never queue what the server rejected.
      return {
        attemptId,
        mastery: null,
        queued: false,
        error: String(result.error),
      };
    }
  }

  if (!isOutboxAvailable()) {
    return {
      attemptId,
      mastery: null,
      queued: false,
      error:
        "This answer could not be saved — offline storage is unavailable in this browser.",
    };
  }

  const queued = await enqueueAttempt({
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
    latencyMs: attempt.latencyMs ?? null,
    capturedAt,
  });

  if (!queued) {
    return {
      attemptId,
      mastery: null,
      queued: false,
      error: "This answer could not be saved offline.",
    };
  }

  return { attemptId, mastery: null, queued: true, error: null };
}
