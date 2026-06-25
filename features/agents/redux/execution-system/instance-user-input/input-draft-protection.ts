// features/agents/redux/execution-system/instance-user-input/input-draft-protection.ts
//
// ============================================================================
//  THE SMART-INPUT DRAFT IS SACRED. READ THIS BEFORE TOUCHING ANY CLEAR PATH.
// ============================================================================
//
// CORE PRODUCT INVARIANT (do NOT "optimize" this away):
//
//   The smart input (composer) and the conversation area (where agent
//   responses + user bubbles render) are OFTEN NOT on the same message turn.
//   The MOMENT a user submits, the composer flips to the NEXT message turn and
//   starts holding whatever the user types for their next message.
//
//   That next-message draft is the single most valuable, irreplaceable piece of
//   data in the app. A user may spend MANY MINUTES (15+ for a coding agent)
//   composing the next message WHILE the current agent response streams in.
//
//   => NOTHING the conversation area does — streaming, finishing, re-rendering,
//      turn flips, record reservations, success cleanup — may EVER clear that
//      draft. The conversation can render whatever it wants. The composer is
//      untouchable by any outside force.
//
// WHY THIS FILE EXISTS:
//
//   Multiple coding agents have repeatedly broken this by wiring an
//   unconditional `text = ""` into clear paths that fire on stream events
//   (`markInputPersisted` on cx_user_request reservation; `clearUserInput` on
//   success-path stream end). On chat & agents/run the input and display share
//   ONE conversationId, so those clears land directly on the user's live draft.
//   This nuked a user's 15-minute message twice in one session.
//
//   Every clear that can run during/after a stream MUST route through
//   `isInputDraftProtected` so the only thing it can ever wipe is the exact
//   message that was just submitted — never a new draft.
//
// THE RULE (one line):
//
//   Clearing `entry.text` is allowed ONLY when the text is still the
//   just-submitted message (text === lastSubmittedText, or empty). The instant
//   the user types a single new character, `setUserInputText` flips
//   `submissionPhase` back to "idle" and the text diverges from
//   `lastSubmittedText` — at which point the draft is PROTECTED and any clear
//   attempt is a BUG, surfaced loudly via `reportInputDraftViolation`.
//
// IF YOU NEED TO CLEAR ON A NEW TURN: don't clear the shared draft. Split the
// input onto a fresh conversationId (see `splitInputIntoNewConversation`) so the
// stream cleanup targets the OLD streaming id and the composer keeps its draft.
//
// SAME INVARIANT, OTHER COMPOSER STATE (text is not the only sacred thing):
//   - ATTACHMENTS (pasted images, files, any resource) are protected by a
//     submitted-snapshot in the resources slice: `markResourcesSubmitted`
//     records the ids being sent; `clearSubmittedResources` removes ONLY those.
//     Anything attached after submit (a next-message draft) is, by construction,
//     never in the snapshot and so can never be cleared by a stream event. Use
//     `clearSubmittedResources` — NEVER `clearAllResources` — on any
//     stream/conversation cleanup path. (`clearAllResources` is for explicit
//     user "clear attachments" UI only.) See instance-resources.slice.ts.
//   - VARIABLES are reset on stream-end only when no pending draft exists at all
//     (`!isInputDraftProtected(text) && !selectHasUnsentResources`).
// Net: text + attachments + variables — the WHOLE composer — survive a stream.
// ============================================================================

import type { InstanceUserInputState } from "@/features/agents/types/instance.types";

/**
 * True when `entry.text` holds a live next-message draft that MUST NOT be
 * cleared by any conversation/stream-driven cleanup.
 *
 * Protected = there is non-empty text that is NOT the message we just
 * submitted. That can only happen because the user typed something new after
 * (or instead of) the submitted message.
 *
 * NOT protected (safe to clear) =
 *   - empty text (nothing to lose), or
 *   - text that is exactly the just-submitted message (the visual "clear on
 *     send" — that copy already lives in the conversation + `lastSubmittedText`).
 */
export function isInputDraftProtected(
  entry: Pick<InstanceUserInputState, "text" | "lastSubmittedText">,
): boolean {
  const text = entry.text ?? "";
  if (text.length === 0) return false;
  // The submitted message is allowed to be cleared (it's been persisted +
  // mirrored into the conversation). Anything else is the user's new draft.
  return text !== (entry.lastSubmittedText ?? "");
}

/**
 * LOUD recovery. A protected draft was about to be wiped by a clear path —
 * which means a real bug got past the proactive layer (repo "loud recovery"
 * doctrine). We refuse the wipe (the draft survives) and scream so the
 * regression is impossible to ignore. Never silent.
 *
 * `scope` is the call site (e.g. "markInputPersisted", "clearUserInput") so the
 * offending path is obvious in the console.
 */
export function reportInputDraftViolation(
  scope: string,
  conversationId: string,
  preservedTextLength: number,
): void {
  console.error(
    `[smart-input/PROTECTED] ${scope} tried to clear a live composer draft on ` +
      `conversation "${conversationId}" (${preservedTextLength} chars). ` +
      `The draft was PRESERVED. The smart-input draft must never be cleared by ` +
      `conversation/stream events — see input-draft-protection.ts. This is a bug.`,
  );
}
