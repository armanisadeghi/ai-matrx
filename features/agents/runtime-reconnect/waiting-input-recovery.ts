export type WaitingInputRecoveryDecision =
  | "prompt_visible"
  | "pending_tool"
  | "waiting_on_person"
  | "continue"
  | "needs_action";

/**
 * Decide from durable facts, never from the runtime status label alone.
 *
 * WAITING_INPUT with zero ledger rows used to mean the answer already landed
 * and the lost step is continuation. Since a tool may park its OWN call on a
 * person (an `approve_spend` ask: the row stays `delegated` with
 * `metadata.parked_on`, and `pending_calls` deliberately omits it so no client
 * answers it), zero pending calls is no longer proof of that: an OPEN action
 * request on this conversation says the turn is still waiting on the person.
 * That turn is never resumed and never "needs action" — its card holds the ask.
 */
export function decideWaitingInputRecovery(args: {
  pendingCallCount: number;
  pendingAskCount: number;
  /** Open action requests this conversation's turn is parked on. */
  parkedOnPersonCount: number;
  userRequestId: string | null;
}): WaitingInputRecoveryDecision {
  if (args.pendingAskCount > 0) return "prompt_visible";
  if (args.pendingCallCount > 0) return "pending_tool";
  if (args.parkedOnPersonCount > 0) return "waiting_on_person";
  if (args.userRequestId) return "continue";
  return "needs_action";
}
