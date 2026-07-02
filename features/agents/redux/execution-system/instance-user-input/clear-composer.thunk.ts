// features/agents/redux/execution-system/instance-user-input/clear-composer.thunk.ts
//
// THE ONE SANCTIONED CLEAR-ON-SEND PATH.
//
// Every stream/conversation-driven "clear the composer now that the send has
// landed" site MUST route through this helper instead of dispatching
// `clearUserInput` / `markInputPersisted` directly. Why:
//
//   • It PRE-CHECKS `isInputDraftProtected`. If the user has started composing
//     their next message (text diverged from the just-submitted message), it
//     silently NO-OPs — typing during a stream is designed behaviour, not a bug
//     to scream about. The draft is untouched (the SACRED invariant in
//     input-draft-protection.ts).
//   • Because it pre-checks, the underlying reducer's protection guard never
//     trips on THIS path — so the loud `reportInputDraftViolation` scream is
//     reserved for its real job: catching a ROGUE *direct* clear that skipped
//     this helper. Do NOT weaken that reducer tripwire.
//
// `via` selects which clear the site was already doing so behaviour is
// preserved exactly for the non-typing (safe) case:
//   • "persist" → `markInputPersisted` (cx_user_request reservation site): sets
//                 submissionPhase "persisted" + wipes the just-sent text.
//   • "clear"   → `clearUserInput` (stream-success / send-failure sites): wipes
//                 the just-sent text + returns submissionPhase to "idle".

import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  clearUserInput,
  markInputPersisted,
} from "./instance-user-input.slice";
import { isInputDraftProtected } from "./input-draft-protection";

export type ClearComposerVia = "persist" | "clear";

/**
 * Clear the composer for `conversationId` IFF it still holds the just-submitted
 * message (i.e. the user has not begun a new draft). A live next-message draft
 * is left completely untouched, silently. This is the only clear-on-send path
 * any surface — chat, scribe, builder, and every other — should use.
 */
export function clearComposerIfUnsubmitted(
  conversationId: string,
  opts?: { via?: ClearComposerVia },
) {
  return (dispatch: AppDispatch, getState: () => RootState): void => {
    const via = opts?.via ?? "clear";
    const entry =
      getState().instanceUserInput.byConversationId[conversationId];

    // Live next-message draft → SACRED. Do nothing (and, crucially, never reach
    // the reducer's violation scream — this is the sanctioned path).
    if (entry && isInputDraftProtected(entry)) return;

    if (via === "persist") {
      dispatch(markInputPersisted(conversationId));
    } else {
      dispatch(clearUserInput(conversationId));
    }
  };
}
