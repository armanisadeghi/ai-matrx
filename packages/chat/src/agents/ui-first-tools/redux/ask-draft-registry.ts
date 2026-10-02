/**
 * Module-level registry of the user's IN-PROGRESS answers to pending ask cards.
 *
 * Why it exists: a card body (radio picked, text typed, "Next" clicked inside a
 * batch wizard) holds its state locally in React. When the user then submits
 * from the main chat composer instead of the card, `resolvePendingAsksWithInput`
 * must deliver those answers to the agent — never throw them away and never
 * substitute a bare freeform reply for a question the user already answered.
 * Bodies publish their latest submittable state here; the composer path reads it.
 *
 * Why outside Redux: the value is a per-keystroke mirror of transient body
 * state and would otherwise churn the store on every character. It carries
 * `secret` answers, which must never land in serializable/devtools-visible state.
 *
 * Lifecycle: `resolveAskByCallId` (every resolution path — answer, cancel,
 * expiry, composer submit) clears the draft, so nothing outlives its ask.
 */

import type { AskUserResponse } from "../tools/schemas";

const drafts = new Map<string, AskUserResponse>();

/** Publish the latest submittable answer for an ask; `null` clears it. */
export function setAskDraft(
  callId: string,
  response: AskUserResponse | null,
): void {
  if (response) drafts.set(callId, response);
  else drafts.delete(callId);
}

export function getAskDraft(callId: string): AskUserResponse | undefined {
  return drafts.get(callId);
}

export function clearAskDraft(callId: string): void {
  drafts.delete(callId);
}

/** Test helper — never called in production code. */
export function __clearAllDraftsForTests(): void {
  drafts.clear();
}
