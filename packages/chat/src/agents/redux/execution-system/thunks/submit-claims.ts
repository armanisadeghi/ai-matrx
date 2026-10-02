/**
 * Synchronous single-flight admission for one composer submission.
 *
 * `smartExecute` crosses asynchronous pre-send gates before Redux can mark the
 * conversation as running. A second click/Enter during that window otherwise
 * sees the same idle state and can launch the same draft again. Claims are
 * deliberately module-local: they cover the browser event race, while the
 * server turn lock remains the cross-tab/process backstop.
 */

import type { InstanceUserInputState } from "../../../types/instance.types";

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

// =============================================================================
// Execution admission — THE ONE SEND DOOR (`executeInstance`)
// =============================================================================
//
// W-32 (2026-10-01): a shortcut with `auto_run` and an interactive display
// mode fired twice. `launchAgentExecution` dispatched `executeInstance` and
// the overlay it had just opened mounted `AgentRunner`, whose auto-run effect
// dispatched `executeInstance` again. Both passed the concurrent-turn guard,
// because `executeInstance` awaits the organization gate, the live-page
// refresh and the context rules BEFORE it sets `status: "running"` — the
// guard read an idle conversation twice. The second request saw the first
// one's optimistic bubble, routed as a continuation, carried no user input
// and was saved as a provider error.
//
// `smartExecute`'s submit claim covers composer events only; every direct
// caller reaches the door without it. So the door itself takes a synchronous
// claim before its first await. The token makes the release exact: a claim
// is released only by the dispatch that took it, never by a later one.

const executionClaims = new Map<string, symbol>();

/**
 * Take the door's claim. Returns the release token, or `null` when another
 * dispatch is already between the door and `status: "running"`.
 */
export function claimExecution(conversationId: string): symbol | null {
  if (executionClaims.has(conversationId)) return null;
  const token = Symbol(conversationId);
  executionClaims.set(conversationId, token);
  return token;
}

/** Release only when `token` still owns the claim. Idempotent. */
export function releaseExecutionClaim(
  conversationId: string,
  token: symbol | null,
): void {
  if (token && executionClaims.get(conversationId) === token) {
    executionClaims.delete(conversationId);
  }
}

/** True while a dispatch is admitted but has not yet marked the run live. */
export function isExecutionClaimed(conversationId: string): boolean {
  return executionClaims.has(conversationId);
}

/**
 * True while a send on this conversation is between its keypress and
 * `running` — a composer submit passing its gates (`claimSubmit`) or a
 * dispatch admitted at the door (`claimExecution`). A second submit in this
 * window is HELD behind it (smartExecute), never dropped.
 */
export function isSendInFlight(conversationId: string): boolean {
  return claims.has(conversationId) || executionClaims.has(conversationId);
}
