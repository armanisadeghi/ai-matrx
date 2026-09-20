// features/agents/redux/execution-system/instance-user-input/restore-composer-draft.thunk.ts
//
// THE ONE SANCTIONED RESTORE PATH. Step 2 of the compare-and-apply described in
// `composer-draft-store.ts`.
//
// A restore is the only thing in the system that can put text the user did not
// just type INTO the composer, which makes it the one thing that could
// resurrect a message they already sent. So it never trusts the token it was
// handed: it re-checks the storage record AND the live slice, and refuses
// unless nothing has moved. `peekComposerDraft` → `applyComposerDraft` may be
// separated by any number of ticks, renders or awaits; the window is harmless
// because the validation happens at APPLY time, inside one synchronous
// dispatch, not at peek time.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { setUserInputText } from "./instance-user-input.slice";
import {
  isComposerDraftTokenLive,
  type ComposerDraftToken,
} from "./composer-draft-store";
import { isDraftRestoreEnabled } from "./composer-draft.middleware";

export type ComposerDraftRestoreOutcome =
  | "restored"
  /** The knob is off. */
  | "disabled"
  /** A send, another tab or a destroy invalidated the token. */
  | "superseded"
  /** The composer already holds something — never overwrite what is on screen. */
  | "occupied"
  /**
   * The input entry is not there yet. Restore must not create it — that is
   * `createInstanceFull` / `initInstanceUserInput`. Writing through
   * `setUserInputText` here was the PRE-INIT scream (a 125-char draft on
   * `/agents/…/build` reload looked like lost work). The hook retries when
   * the entry lands.
   */
  | "not_ready";

export function applyComposerDraft(token: ComposerDraftToken) {
  return (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): ComposerDraftRestoreOutcome => {
    const state = getState();
    if (!isDraftRestoreEnabled(state)) return "disabled";

    // THE RACE CHECK, and it goes FIRST. A submit bumps the generation and
    // lays a tombstone BEFORE the request leaves, so a token peeked before it
    // can never pass here. Checking it ahead of everything else also keeps the
    // outcome honest: a refused token is "superseded", not whatever the slice
    // happens to look like a moment after the send.
    if (!isComposerDraftTokenLive(token)) return "superseded";

    const entry =
      state.instanceUserInput.byConversationId[token.conversationId];
    // Restore is a sanctioned write, not a keystroke. Creating the entry here
    // fired `smart-input-pre-init-capture` on every reload that still had a
    // draft while the launcher's agent fetch was in flight. Wait.
    if (!entry) return "not_ready";
    // Never overwrite something the user can already see, and never land on a
    // composer whose submit is in flight — its text is the message being sent.
    if (entry.text.length > 0) return "occupied";
    if (entry.submissionPhase !== "idle") return "occupied";

    dispatch(
      setUserInputText({
        conversationId: token.conversationId,
        text: token.value,
      }),
    );
    return "restored";
  };
}
