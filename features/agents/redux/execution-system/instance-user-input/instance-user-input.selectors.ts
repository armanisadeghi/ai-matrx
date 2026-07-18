import type { RootState } from "@/lib/redux/store";
import type { MessagePart } from "@/types/python-generated/stream-events";
import type { InputSubmissionPhase } from "@/features/agents/types/instance.types";

const EMPTY_USER_VALUES: Record<string, unknown> = Object.freeze({});

/**
 * The current text input for this instance.
 * Returns "" when no entry exists — safe because "" is a string literal
 * (always the same reference), so ?? "" does not cause new-reference churn.
 */
export const selectUserInputText =
  (conversationId: string) =>
  (state: RootState): string =>
    state.instanceUserInput.byConversationId[conversationId]?.text ?? "";

/**
 * The message parts for this instance.
 * Returns undefined when no entry exists — guard in component.
 * Never use ?? [] here: that creates a new array reference on every call
 * when the entry is missing, causing a re-render on every dispatch.
 */
export const selectUserInputMessageParts =
  (conversationId: string) =>
  (state: RootState): MessagePart[] | undefined =>
    state.instanceUserInput.byConversationId[conversationId]?.messageParts ??
    undefined;

/**
 * Character count of the current text input.
 * Returns a primitive number — stable reference, no array/object churn.
 * Used by AgentTextarea to decide whether to show the expand button.
 */
export const selectInputCharCount =
  (conversationId: string) =>
  (state: RootState): number =>
    state.instanceUserInput.byConversationId[conversationId]?.text?.length ?? 0;

/**
 * Whether the instance's input entry exists yet (created by
 * `createInstanceFull` AFTER the launcher's async agent fetch). Since
 * 2026-07-18 `setUserInputText` no longer drops writes for missing entries —
 * it creates the entry (pre-init capture, never-drop doctrine) and init
 * preserves the draft. Single-use writers (e.g. the draft-transfer stash,
 * which pops sessionStorage) should still gate on this to keep their
 * consume-then-dispatch step idempotent and loudly ordered.
 */
export const selectUserInputEntryExists =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.instanceUserInput.byConversationId[conversationId] !== undefined;

export const selectHasUserInput =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const entry = state.instanceUserInput.byConversationId[conversationId];
    if (!entry) return false;
    return (
      entry.text.trim().length > 0 || (entry.messageParts?.length ?? 0) > 0
    );
  };

/**
 * Current submission phase — "idle" | "pending" | "persisted".
 * Components can use this to tell whether the input should be visually shown
 * ("idle" | "pending") or hidden ("persisted"), and whether to gate the
 * re-apply affordance.
 */
export const selectSubmissionPhase =
  (conversationId: string) =>
  (state: RootState): InputSubmissionPhase =>
    state.instanceUserInput.byConversationId[conversationId]?.submissionPhase ??
    "idle";

/**
 * The text snapshot captured at the most recent submit, preserved across a
 * conversation reset so the user can re-apply it.
 */
export const selectLastSubmittedText =
  (conversationId: string) =>
  (state: RootState): string =>
    state.instanceUserInput.byConversationId[conversationId]
      ?.lastSubmittedText ?? "";

/**
 * The userValues snapshot captured at the most recent submit.
 * Returns a stable frozen empty object when missing to avoid re-render churn.
 */
export const selectLastSubmittedUserValues =
  (conversationId: string) =>
  (state: RootState): Record<string, unknown> =>
    state.instanceUserInput.byConversationId[conversationId]
      ?.lastSubmittedUserValues ?? EMPTY_USER_VALUES;

/**
 * Whether a "Re-apply last input" action is available for this conversation:
 * we have stashed content AND the user hasn't already started typing
 * something new AND we're not mid-submit.
 */
export const selectHasReapplyableInput =
  (conversationId: string) =>
  (state: RootState): boolean => {
    const entry = state.instanceUserInput.byConversationId[conversationId];
    if (!entry) return false;
    if (entry.submissionPhase === "pending") return false;
    if (entry.text.length > 0) return false;
    return entry.lastSubmittedText.length > 0;
  };
