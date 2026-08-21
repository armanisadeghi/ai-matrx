/**
 * Synchronous single-flight admission for one composer submission.
 *
 * `smartExecute` crosses asynchronous pre-send gates before Redux can mark the
 * conversation as running. A second click/Enter during that window otherwise
 * sees the same idle state and can launch the same draft again. Claims are
 * deliberately module-local: they cover the browser event race, while the
 * server turn lock remains the cross-tab/process backstop.
 */

import type { InstanceUserInputState } from "@/features/agents/types/instance.types";

const claims = new Set<string>();

/** Take the claim before the first await in the submit path. */
export function claimSubmit(conversationId: string): boolean {
  if (claims.has(conversationId)) return false;
  claims.add(conversationId);
  return true;
}

/** Release on every blocked/error exit, or once execution is admitted. */
export function releaseSubmitClaim(conversationId: string): void {
  claims.delete(conversationId);
}

/**
 * True when another dispatch is attempting to resend the exact input already
 * admitted for the current turn. A genuinely new draft flips the phase back
 * to `idle`, so it remains eligible for QUEUE/STEER while the run is live.
 */
export function isDuplicateSubmittedInput(
  entry:
    | Pick<
        InstanceUserInputState,
        "text" | "lastSubmittedText" | "submissionPhase"
      >
    | undefined,
): boolean {
  return (
    entry?.submissionPhase === "pending" &&
    entry.text === entry.lastSubmittedText
  );
}
