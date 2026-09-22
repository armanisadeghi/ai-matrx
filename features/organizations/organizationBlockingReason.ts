"use client";

// organizationBlockingReason — the SHARED SEAM for a primary action that must
// be honest-disabled (Continue's own pattern: `GatedActionButton` +
// `firstBlockingReason`) rather than pressable-into-a-picker.
//
// THE DEFECT THIS CLOSES (D1, jobs-bar cold-walk-12, 2026-09-19)
// ----------------------------------------------------------------------
// `/masterwork/new` step 2's "Start" button read `selectOrganizationId`
// itself and, with nothing selected, hand-rolled a bounded wait INSIDE its
// click handler — outside any try/catch. The wait's own dependency
// (`knobInt`) could reject, and the rejection propagated out of an `onClick`
// wrapped in `void`, so the failure became an unhandled promise rejection: no
// state update landed, the button stayed enabled, blue and primary-styled,
// and the click produced zero network requests and no visible change at all.
// One click with an organization selected worked in a second; the identical
// click with none selected did nothing, silently — exactly the "disabled-
// looking, or lying" screen law 4 forbids.
//
// Owner ruling (Arman, 2026-09-19): there is no default organization, so a
// primary creation action must make the workspace an explicit, visible
// choice. Its button is EITHER honest-disabled with the reason beside it (the
// same pattern `Continue` already uses on the very same screen) OR, when the
// person belongs to exactly one workspace, silently pre-selected — never a
// third state where the button looks live and is not.
//
// THE CLASS FIX. Every primary action across the Masterwork creation flow
// (and the Library/exports creation flows) that needs an organization reads
// `useOrganizationRequired()` for the three-state reading (already the one
// shared primitive every org-scoped surface in this repo uses) and turns it
// into ONE sentence through this function — never a bespoke `if
// (!organizationId)` per button. Sole-membership auto-select already lands
// `organizationState === "ready"` with nothing to choose (doctrine: a lone
// membership is not a "default", it is the only answer there is), so this
// reads as `null` and the button behaves exactly as it does today.
//
// A CONTROL that should stay live and open the organization picker on press
// uses `useOrganizationGatedControl` instead (`features/organizations/
// useOrganizationGatedControl.ts`, "THE REFUSAL IS A QUESTION") — that is the
// right shape for a header icon button with no room for inline text. A
// primary, full-width creation action with a dedicated line for its own
// reason (Start's sticky bar, a dialog's submit row) uses THIS function so it
// reads exactly like every other honest-disabled primary action beside it.

import type { OrganizationState } from "./useOrganizationRequired";

/**
 * The sentence to show beside a primary action, or `null` when nothing about
 * the organization blocks it. `act` is a gerund phrase naming the act —
 * "starting this Rulebook", "cataloguing this Library" — so the sentence
 * reads as an instruction with a remedy, never a wire error.
 */
export function organizationBlockingReason(
  organizationState: OrganizationState,
  act: string,
): string | null {
  switch (organizationState) {
    case "ready":
      return null;
    case "resolving":
      // Not a refusal — boot has not settled yet and settles in
      // milliseconds on a warm page. Never spelled as the terminal state.
      return "Getting your workspace ready…";
    case "unavailable":
      // The READ failed; nobody looked at this person's memberships, so this
      // never tells them to choose one (R37, 2026-09-18's ruling, carried
      // here verbatim).
      return `We could not check which workspace you are working in, so ${act} is not available right now. Reload the page to try again.`;
    case "required":
      return `Choose a workspace before ${act} — pick one from the menu under your avatar.`;
    case "signed_out":
      // 🚨 THE FIFTH STATE (FIX-10C, 2026-09-22). Nobody is signed in, so
      // "choose a workspace" names a question this person cannot be asked —
      // the menu under the avatar is not there, and neither is the avatar.
      return `Sign in before ${act} — this is your workspace's, and we do not know who you are yet.`;
  }
}
