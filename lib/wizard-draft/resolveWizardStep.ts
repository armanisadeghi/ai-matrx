// lib/wizard-draft/resolveWizardStep.ts
//
// THE STEP DECISION for a form whose step lives in the URL (W43).
//
// Three outcomes, and exactly one of them is new:
//
//   "loading"  the saved answers have not been read back yet. Show the form's
//              own waiting state — NEVER a later step built from defaults.
//   "step"     render this step; its prerequisites are present.
//   "lost"     the URL asks for a later step and the answers it depends on do
//              not exist (deep link, expired draft, another device). Say so in
//              plain words and send the person back to the first step.
//
// Silently demoting to step 1 is NOT one of them: the URL still said step 2,
// the person had already answered, and nothing told her the answers were gone.
//
// Pure on purpose — the rule is the thing worth guarding, and it is guarded in
// __tests__/resolveWizardStep.test.ts.

import type { WizardDraftStatus } from "./useWizardDraft";

export type WizardStepResolution<S> =
  | { kind: "loading" }
  | { kind: "step"; step: S }
  | { kind: "lost"; requestedStep: S };

export function resolveWizardStep<S>(input: {
  /** The step the URL asks for. */
  requestedStep: S;
  /** The step that depends on nothing — always renderable. */
  firstStep: S;
  /** Where the persisted read stands. */
  draftStatus: WizardDraftStatus;
  /** Does the requested step have the answers it needs, right now? */
  prerequisitesMet: boolean;
}): WizardStepResolution<S> {
  const { requestedStep, firstStep, draftStatus, prerequisitesMet } = input;
  if (requestedStep === firstStep) return { kind: "step", step: firstStep };
  if (prerequisitesMet) return { kind: "step", step: requestedStep };
  if (draftStatus === "loading") return { kind: "loading" };
  return { kind: "lost", requestedStep };
}
