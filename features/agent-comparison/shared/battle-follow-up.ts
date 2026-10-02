/**
 * Which battle columns a Submit All can start, and which need a typed follow-up.
 *
 * Submit All copies the shared composer into every column and sends it. A
 * column that has NOT run yet may start from the agent's variables alone (the
 * server renders the agent's own messages on turn one). A column that already
 * ran sends only `user_input` on its next turn, so an empty shared composer is
 * an empty follow-up that the send door refuses (`refusesEmptyTurn`, W-32) —
 * which surfaced as one "failed" per column (Model Battle, 2026-10-01).
 *
 * The SAME rule the door applies decides it here, before anything is copied:
 * fresh columns fire; columns the door would refuse are held, and the shared
 * composer says why (ruling 2026-10-01: refuse up front, no per-column failures).
 */

import type { RootState } from "@/lib/redux/store";
import {
  agentUserInputFromSubmission,
  captureSubmission,
} from "@ai-matrx/chat/agents/redux/execution-system/thunks/frozen-submission";
import { refusesEmptyTurn } from "@ai-matrx/chat/agents/redux/execution-system/thunks/execute-instance.thunk";
import { selectMessageCount } from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors";

export interface BattleFanOutPlan {
  /** Columns that start (or continue) from this Submit All. */
  fire: string[];
  /** Columns that already ran and would get an empty follow-up — held. */
  needFollowUp: string[];
}

export function planBattleFanOut(
  state: RootState,
  sourceConversationId: string,
  columnConversationIds: readonly string[],
): BattleFanOutPlan {
  const userInput = agentUserInputFromSubmission(
    captureSubmission(state, sourceConversationId),
  );
  const plan: BattleFanOutPlan = { fire: [], needFollowUp: [] };
  for (const conversationId of columnConversationIds) {
    const conversation = state.conversations.byConversationId[conversationId];
    const refused = refusesEmptyTurn({
      retry: false,
      hasPriorTurns: selectMessageCount(conversationId)(state) > 0,
      cacheOnly: conversation?.cacheOnly === true,
      isEphemeral: conversation?.isEphemeral === true,
      userInput,
    });
    (refused ? plan.needFollowUp : plan.fire).push(conversationId);
  }
  return plan;
}

/** The shared composer's line while a held column waits for a typed follow-up. */
export const FOLLOW_UP_NEEDED_TEXT = "Type a follow-up to run again";
