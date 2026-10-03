import { isHandedOnErrorName } from "../redux/execution-system/thunks/execution-rejection-meta";

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

export type AfterContinueRefused = "leave" | "clear" | "needs_action";

/**
 * The reconnect follower dispatched its own resume and it was REFUSED. A
 * refusal that hands the turn on (`isHandedOnErrorName`: a scheduled retry, or
 * another resume already holds the single-flight claim) is never the person's
 * problem: with a live stream the follower's stamp is stale and is cleared;
 * before the holder's stream opens it stays "continuing" (the holder clears it
 * when it opens). Only a real failure asks the person to continue
 * (board chat, 2026-10-02: "paused without a visible question" while the agent
 * was working).
 */
export function decideAfterContinueRefused(args: {
  originalErrorName: string | undefined;
  liveStream: boolean;
}): AfterContinueRefused {
  if (!isHandedOnErrorName(args.originalErrorName)) return "needs_action";
  return args.liveStream ? "clear" : "leave";
}
