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
//   required    → ENABLED, "Choose an organization to continue." — pressing it
//                 OPENS THE PICKER, the person sets one, and the act it was
//                 wrapping runs with it (2026-09-19; see THE REFUSAL IS A
//                 QUESTION below).
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
// 🚨 THE REFUSAL IS A QUESTION, NOT A WALL (Arman, 2026-09-19). The `required`
// state used to DISABLE the control and put "Select an organization before
// <act>." in its tooltip — factually true, and a dead end in fourteen files:
// the person is told to go somewhere else, do something else, and come back.
// That is the same dead end that pushed every boot ladder in this codebase to
// GUESS an organization rather than end without one, which is how a platform
// with organizations quietly turns into a platform with a user and a default.
//
//   "one missed org check that should have just failed turns into 50 in a
//    month and 5,000 in a year, and suddenly we don't have orgs any more, we
//    have a user and a default org, which means we just have user now."
//
// The ruling closes the loop from the other side: nothing picks for the
// person, and every refusal must offer them the pick. So `required` keeps the
// control LIVE and its press opens the picker through the ONE gate
// (`ensureOrganizationContext`); when they choose, `press`'s wrapped act runs
// immediately with the organization they just set. Cancelling does nothing at
// all — no toast, no error, exactly where they were. A consumer gets this for
// free by wrapping its action in `press(...)`, which is why
// `check:org-three-states` rule 3 refuses a consumer that renders the posture
// without it.
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
import {
  ensureOrganizationContext,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";

/** What the control shows while boot has not answered yet. Never a refusal. */
export const ORGANIZATION_RESOLVING_TITLE =
  "Checking which organization you are working in…";

/**
 * The refusal sentence for a control, from the act it performs. `act` is a
 * gerund phrase naming the act — "importing Google Tasks", "creating a note" —
 * so the sentence reads as an instruction with a remedy, never as a wire error.
 */
export function organizationControlRefusal(act: string): string {
  return `Choose an organization before ${act}.`;
}

/**
 * What a control says when the organization could NOT BE READ. It never names
 * the act, because the act is not the problem and nothing the person does to
 * the act will help — the read is what failed.
 */
export const ORGANIZATION_SIGNED_OUT_TITLE_CONTROL =
  "Sign in first — we do not know who you are yet. Press to sign in.";

export const ORGANIZATION_UNAVAILABLE_TITLE_CONTROL =
  "We could not check which organization you are working in. Press to try again.";

export interface OrganizationGatedControl {
  /** The selected organization, or null while resolving / with none. */
  organizationId: string | null;
  organizationState: OrganizationState;
  /**
   * True ONLY while the answer is still coming — a control never acts on a
   * guess. FALSE in `unavailable`, where the press is the remedy (see THE
   * REMEDY IS THE PRESS), and FALSE in `required`, where the press is the
   * QUESTION (see THE REFUSAL IS A QUESTION): both of those states have
   * something useful to do with a click, and a control that can do something
   * useful is never dead.
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
   *   required    → opens the picker and, once the person SETS an
   *                 organization, runs `act` with it. Cancelling does nothing;
   *   resolving   → nothing, and the control is disabled anyway.
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
      case "signed_out":
        // Never the organization question: there is nobody to ask it of.
        return ORGANIZATION_SIGNED_OUT_TITLE_CONTROL;
    }
  };
  const press = (act: (organizationId: string) => void) => () => {
    // The fourth state's press IS the remedy: it asks the question again,
    // through the ONE re-run every other "Try again" on this state calls.
    if (organizationState === "unavailable") {
      retry();
      return;
    }
    // NOBODY IS SIGNED IN. The press is still the remedy, and the remedy is the
    // sign-in screen with this exact address to come back to — including its
    // `?org=`, which is what makes the link's own organization rung fire on the
    // way back in (`lib/organizations/linkOrganization.ts`).
    if (organizationState === "signed_out") {
      if (typeof window !== "undefined") {
        window.location.assign(
          `/login?returnUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`,
        );
      }
      return;
    }
    // The refusal's press IS the question. Hold the act, open the ONE picker,
    // and run it with whatever the person sets — never with a guess, and never
    // with nothing. Cancelling (`OrganizationSelectionCancelled`) is an answer
    // meaning "not now", so it is swallowed here: no toast, no banner, nothing
    // moved. Any OTHER failure (no picker mounted at all) is the fail-closed
    // path and is reported rather than silently dropped.
    if (organizationState === "required") {
      void ensureOrganizationContext()
        .then((organizationId) => act(organizationId))
        .catch((error: unknown) => {
          if (isOrganizationSelectionCancelled(error)) return;
          console.error(
            "[organizations] the picker could not be opened for a gated control; the action did not run.",
            error,
          );
        });
      return;
    }
    // Never act on a guess. `disabled` already covers `resolving` for a mouse;
    // this covers a keyboard, a programmatic click and a stale render.
    if (organizationId == null) return;
    act(organizationId);
  };
  return {
    organizationId,
    organizationState,
    // Only `resolving` disables. `unavailable` stays pressable because the
    // press re-runs the read; `required` stays pressable because the press
    // asks the question.
    disabled: organizationState === "resolving",
    title: title(),
    retry,
    press,
  };
}
