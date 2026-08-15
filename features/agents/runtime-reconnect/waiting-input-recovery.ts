export type WaitingInputRecoveryDecision =
  "prompt_visible" | "pending_tool" | "continue" | "needs_action";

/**
 * Decide from durable facts, never from the runtime status label alone.
 * WAITING_INPUT with zero ledger rows means the answer already landed and the
 * lost step is continuation—not user input.
 */
export function decideWaitingInputRecovery(args: {
  pendingCallCount: number;
  pendingAskCount: number;
  userRequestId: string | null;
}): WaitingInputRecoveryDecision {
  if (args.pendingAskCount > 0) return "prompt_visible";
  if (args.pendingCallCount > 0) return "pending_tool";
  if (args.userRequestId) return "continue";
  return "needs_action";
}
