/**
 * Hold the session review boundary until every grade already launched by the
 * drill has reached a terminal Redux state. Card progression remains fully
 * concurrent; only the one end-of-session snapshot waits.
 */
export async function reviewAfterPendingGrades(
  pendingGrades: Iterable<Promise<unknown>>,
  runReview: () => Promise<unknown> | unknown,
): Promise<void> {
  await Promise.allSettled(Array.from(pendingGrades));
  await runReview();
}
