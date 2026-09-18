"use client";

// useOrganizationGatedControl — the three states for a CONTROL, so a surface
// cannot spell the waiting beat as the refusal.
//
// THE DEFECT THIS CLOSES (VERIFY-R7-FIX-WAVE NEW-1, seat-proven 2026-09-18)
// ------------------------------------------------------------------------
// The Tasks header's "Import from Google Tasks" button read the bare
// `selectOrganizationId` and derived both its `disabled` and its tooltip from
// that one nullable value:
//
//   @4048ms  disabled title="Select an organization before importing Google Tasks."
//   +9571ms  GET /rest/v1/organizations?…            ← memberships only NOW
//   @17395ms disabled title="Select an organization before importing Google Tasks."
//   @20601ms disabled=null title=null                ← the org was always there
//
// The person had an organization the whole time. `null` means two things
// (`useOrganizationRequired` names all three states) and a control that reads
// the id can tell them apart never — so it told a factual lie for thirteen
// seconds, with a remedy the person did not need, in the very file the previous
// round closed the same class in.
//
// THE CLASS FIX. A control that needs an organization does not write this
// logic. It asks for the gate, by the act it performs, and renders what it is
// handed:
//
//   const org = useOrganizationGatedControl("importing Google Tasks");
//   <Button disabled={org.disabled} title={org.title}
//           onClick={() => { if (!org.organizationId) return;
//                            open({ organizationId: org.organizationId }); }} />
//
//   resolving   → disabled, "Checking which organization you are working in…"
//   required    → disabled, "Select an organization before <act>."
//   unavailable → ENABLED, "We could not check which organization you are
//                 working in. Press to try again." — never the refusal (R37,
//                 2026-09-18): the read failed, so nothing is known about this
//                 person's memberships and telling them to pick one is a claim
//                 we never verified. That is exactly what this very control did
//                 for 24 seconds to a member of thirteen organizations after
//                 one `TypeError: Failed to fetch` (V-23 NEW-2).
//
// 🚨 THE REMEDY IS THE PRESS (V-24 NEW-3, 2026-09-18). The fourth state used to
// say "Try again." from a tooltip on a control that could not be pressed, and
// on `/tasks` there was no organization Try again ANYWHERE on the page — the
// only one on screen belonged to the task list, and pressing it left the import
// control saying "Try again." for the whole 20s that was then sampled. A
// sentence naming a remedy the screen does not offer is the dead-or-lying
// screen law 4 forbids, in a smaller frame. So the posture carries its own
// remedy: in `unavailable` the control is ENABLED and its press re-runs the ONE
// organization read (`useOrganizationRequired().retry` →
// `retryActiveOrgBootstrap`). One press, one remedy, no second button to hunt
// for — and the sentence is true, because pressing this really is trying again.
// A consumer gets that for free by wrapping its own action in `press(...)`
// instead of writing its own `onClick`; `check:org-three-states` rule 3 refuses
// a consumer that renders the posture without it.
//   ready       → enabled, no title
//
// The refusal sentence is built by the ONE builder every other refusal in the
// repo uses (`organizationRefusalMessage` is its toast twin), so the wording
// can never drift per surface and `check:org-refusal-honesty` keeps reading it.
//
// A BODY rather than a control renders `OrganizationContextNotice` instead; a
// CLICK HANDLER that must wait rather than refuse uses
// `awaitEffectiveOrganizationId` (features/organizations/awaitWorkspace.ts).
//
// Law: common-docs/policies/context-is-carried-never-rebuilt.md.

import {
  useOrganizationRequired,
  type OrganizationState,
} from "@/features/organizations/useOrganizationRequired";

/** What the control shows while boot has not answered yet. Never a refusal. */
export const ORGANIZATION_RESOLVING_TITLE =
  "Checking which organization you are working in…";

/**
 * The refusal sentence for a control, from the act it performs. `act` is a
 * gerund phrase naming the act — "importing Google Tasks", "creating a note" —
 * so the sentence reads as an instruction with a remedy, never as a wire error.
 */
export function organizationControlRefusal(act: string): string {
  return `Select an organization before ${act}.`;
}

/**
 * What a control says when the organization could NOT BE READ. It never names
 * the act, because the act is not the problem and nothing the person does to
 * the act will help — the read is what failed.
 */
export const ORGANIZATION_UNAVAILABLE_TITLE_CONTROL =
  "We could not check which organization you are working in. Press to try again.";

export interface OrganizationGatedControl {
  /** The selected organization, or null while resolving / with none. */
  organizationId: string | null;
  organizationState: OrganizationState;
  /**
   * True while the answer is still coming and once it has settled with nothing
   * — a control never acts on a guess. FALSE in `unavailable`, where the press
   * is not the act at all: it is the remedy (see THE REMEDY IS THE PRESS).
   */
  disabled: boolean;
  /** Re-run the organization read. The `unavailable` state's only remedy. */
  retry: () => void;
  /** The `title` to render: the checking beat, the refusal, or nothing. */
  title: string | undefined;
  /**
   * THE CONTROL'S OWN onClick. Wrap the act this control performs and render
   * the result — never a hand-written handler beside `disabled`/`title`, which
   * is how the `unavailable` posture lost its remedy on two surfaces:
   *
   *   onClick={gate.press((organizationId) => open({ organizationId }))}
   *
   *   ready       → runs `act` with the organization, never null;
   *   unavailable → re-runs the organization read (the sentence's own remedy);
   *   resolving / required → nothing, and the control is disabled anyway.
   */
  press: (act: (organizationId: string) => void) => () => void;
}

export function useOrganizationGatedControl(act: string): OrganizationGatedControl {
  const { organizationId, organizationState, retry } = useOrganizationRequired();
  const title = (): string | undefined => {
    switch (organizationState) {
      case "ready":
        return undefined;
      case "resolving":
        return ORGANIZATION_RESOLVING_TITLE;
      case "unavailable":
        return ORGANIZATION_UNAVAILABLE_TITLE_CONTROL;
      case "required":
        return organizationControlRefusal(act);
    }
  };
  const press = (act: (organizationId: string) => void) => () => {
    // The fourth state's press IS the remedy: it asks the question again,
    // through the ONE re-run every other "Try again" on this state calls.
    if (organizationState === "unavailable") {
      retry();
      return;
    }
    // Never act on a guess. `disabled` already covers the other two states for
    // a mouse; this covers a keyboard, a programmatic click and a stale render.
    if (organizationId == null) return;
    act(organizationId);
  };
  return {
    organizationId,
    organizationState,
    // `unavailable` stays pressable — the press re-runs the read.
    disabled: organizationState !== "ready" && organizationState !== "unavailable",
    title: title(),
    retry,
    press,
  };
}
