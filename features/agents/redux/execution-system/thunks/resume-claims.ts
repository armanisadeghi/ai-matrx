/**
 * resume-claims — single-flight guard for /resume, keyed by user_request_id.
 *
 * The server's `continuation_needed` flag is best-effort: when the model
 * issued PARALLEL delegated calls, concurrent POST /tool_results responses
 * can BOTH carry `continuation_needed=true`. Two `resumeInstance` dispatches
 * then race — the `hasAbortController(conversationId)` check inside the thunk
 * passes for both, because the abort controller isn't registered until after
 * `await buildToolInjection(...)`. Two parallel model loops on one
 * conversation produced the 2026-06-09 incident (duplicate cx_message
 * positions, the model re-calling the same tool until the duplicate-call
 * guard errored). The server now takes an atomic run claim and 409s the
 * loser, but there's no reason to even attempt the duplicate.
 *
 * Contract (mirrors matrx-extend's `recentContinueBroadcasts`):
 *   - `claimResume` is called SYNCHRONOUSLY at the top of `resumeInstance`,
 *     before its first `await`. Exactly one claim per user_request_id can be
 *     live at a time.
 *   - A claim clears when the resume stream actually OPENS (the next
 *     legitimate continuation for this request — re-entrancy, §2.4 of
 *     CLIENT_TOOL_SUSPEND_RESUME.md — must be able to claim again).
 *   - Claims age out after a TTL so a resume that never opened (pre-stream
 *     failure that forgot to release, tab backgrounded mid-dispatch) can't
 *     suppress recovery forever.
 *
 * Also owns the bounded retry counter for 409 `resume_conflict` (the
 * suspending run hasn't persisted `status='paused'` yet — a fast tool's
 * result POST can beat that write). Attempts carry across retries of the
 * same user_request so the loop is bounded; they reset when a stream opens.
 */

const CLAIM_TTL_MS = 10_000;

/** userRequestId → epoch ms when the claim was taken. */
const claims = new Map<string, number>();

/** userRequestId → resume_conflict retry attempts so far. */
const conflictAttempts = new Map<string, number>();

/** userRequestId → retries while the just-suspended stream is closing. */
const streamClosingAttempts = new Map<string, number>();

/**
 * Take the single-flight claim for this user_request. Returns false when a
 * live (non-expired) claim already exists — the caller must skip the resume.
 * MUST be called before the first `await` in the resume path.
 */
export function claimResume(userRequestId: string): boolean {
  const now = Date.now();
  const claimedAt = claims.get(userRequestId);
  if (claimedAt !== undefined && now - claimedAt < CLAIM_TTL_MS) {
    return false;
  }
  claims.set(userRequestId, now);
  return true;
}

/**
 * Release a claim without a stream having opened — every bail / error path
 * in `resumeInstance` after a successful claim. Leaving the claim to TTL out
 * would suppress the next /tool_results-triggered resume for up to 10s.
 */
export function releaseResumeClaim(userRequestId: string): void {
  claims.delete(userRequestId);
}

/**
 * The resume stream actually opened for this request. Clear the claim (the
 * resumed loop may suspend again and the NEXT continuation must claim fresh)
 * and reset the conflict-retry counter.
 */
export function onResumeStreamOpened(userRequestId: string): void {
  claims.delete(userRequestId);
  conflictAttempts.delete(userRequestId);
  streamClosingAttempts.delete(userRequestId);
}

export const RESUME_STREAM_CLOSING_MAX_RETRIES = 6;
export const RESUME_STREAM_CLOSING_BACKOFF_MS = 250;

/**
 * A fast client tool can post its result before the original NDJSON reader has
 * unregistered its AbortController. Record a bounded retry rather than
 * discarding the server's authoritative continuation signal.
 */
export function nextResumeStreamClosingAttempt(
  userRequestId: string,
): number | null {
  const attempts = (streamClosingAttempts.get(userRequestId) ?? 0) + 1;
  if (attempts > RESUME_STREAM_CLOSING_MAX_RETRIES) return null;
  streamClosingAttempts.set(userRequestId, attempts);
  return attempts;
}

export const RESUME_CONFLICT_MAX_RETRIES = 4;
export const RESUME_CONFLICT_BACKOFF_MS = 700;

/**
 * Record one more 409 `resume_conflict` retry attempt for this request.
 * Returns the attempt number (1-based), or null when the budget is spent —
 * the caller must stop retrying and log it as benign.
 */
export function nextResumeConflictAttempt(
  userRequestId: string,
): number | null {
  const attempts = (conflictAttempts.get(userRequestId) ?? 0) + 1;
  if (attempts > RESUME_CONFLICT_MAX_RETRIES) return null;
  conflictAttempts.set(userRequestId, attempts);
  return attempts;
}
