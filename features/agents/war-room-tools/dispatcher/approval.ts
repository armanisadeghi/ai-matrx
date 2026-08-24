/**
 * Human-in-the-loop approval for War Room write tools.
 *
 * Every war-room tool mutates the user's live work, so the dispatcher requires
 * an explicit approval before the handler runs. This enqueues a structured
 * `approval`-kind ask that the dedicated `<ApprovalCard>` renders in the SAME
 * `<PendingAsksZone>` already mounted in the war-room panel's conversation
 * column, and awaits the user's decision via the shared ask-resolver registry:
 *
 *   - The shared inline-approval bridge carries the {@link ApprovalChange}
 *     descriptor + threadId and awaits the card's explicit decision.
 *
 * The card resolves `{confirmed:true}` (Approve — plus the REMEMBER_SENTINEL in
 * `selected` when "always approve" is checked), `{confirmed:false}` (Decline),
 * or `{freeform:string}` (Respond — typed instructions instead of approving).
 * Minimizing the card sends nothing and leaves the request pending.
 *
 * Approval asks do NOT carry a timeout: the user may approve seconds or minutes
 * later, exactly like a client-tool answer. The server's far-future abandonment
 * backstop on `cx_tool_call.expires_at` is the only timing source.
 */

import type { RootState } from "@/lib/redux/store";
import {
  selectPendingAsksForConversation,
} from "@/features/agents/ui-first-tools/redux/pending-asks.slice";
import { resolveAskByCallId } from "@/features/agents/ui-first-tools/redux/ask-resolver-registry";
import { EMPTY_ASK_RESPONSE } from "@/features/agents/ui-first-tools/tools/schemas";
import type { ApprovalChange } from "@/features/agents/ui-first-tools/ui/approval-types";
import {
  requestInlineApproval,
  type ApprovalDecision,
  type RequestInlineApprovalInput,
} from "@/features/agents/ui-first-tools/redux/request-approval";

export type WarRoomApprovalDecision = ApprovalDecision;

export interface RequestApprovalInput
  extends Omit<RequestInlineApprovalInput, "toolName"> {
  /** The tile this change acts on (drives the "always approve" scope). */
  threadId: string;
  /** The structured change descriptor the card renders. */
  change: ApprovalChange;
}

/**
 * Enqueue an approval card and await the user's decision. Resolves only once —
 * Approve/Decline/Respond/× all route through the shared resolver.
 */
export async function requestWarRoomApproval(
  input: RequestApprovalInput,
): Promise<WarRoomApprovalDecision> {
  return requestInlineApproval({ ...input, toolName: "war_room" });
}

/**
 * When the user grants "always approve" while several edits are stacked up
 * (e.g. the agent queued three subtask adds in one turn), instantly approve the
 * SIBLING pending approval cards for the same tile + scope so they don't keep
 * asking. Each sibling's awaiting promise unblocks and its handler runs.
 */
export function cascadeAutoApprove(opts: {
  conversationId: string;
  threadId: string;
  scope: string;
  excludeCallId: string;
  getState: () => RootState;
}): void {
  const { conversationId, threadId, scope, excludeCallId, getState } = opts;
  const asks = selectPendingAsksForConversation(conversationId)(getState());
  for (const ask of asks) {
    if (
      ask.status === "pending" &&
      ask.kind === "approval" &&
      ask.callId !== excludeCallId &&
      ask.threadId === threadId &&
      ask.approval?.autoApprove?.scope === scope
    ) {
      resolveAskByCallId(ask.callId, { ...EMPTY_ASK_RESPONSE, confirmed: true });
    }
  }
}
