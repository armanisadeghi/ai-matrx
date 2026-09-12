/**
 * THE STEP DECISION for a URL-driven multi-step form (W43, 2026-09-12).
 *
 * SUT: `resolveWizardStep`. It owns the one rule the Masterwork guided start
 * broke: a later step may be rendered only when its answers are actually
 * there, an unread draft means WAIT, and a missing draft means SAY SO — never
 * a silent demotion to step 1 with the URL still claiming step 2.
 *
 * Nothing is mocked; the rule is pure.
 */

import { resolveWizardStep } from "@/lib/wizard-draft/resolveWizardStep";

describe("resolveWizardStep", () => {
  it("always renders the first step — it depends on nothing", () => {
    expect(
      resolveWizardStep({
        requestedStep: 1,
        firstStep: 1,
        draftStatus: "loading",
        prerequisitesMet: false,
      }),
    ).toEqual({ kind: "step", step: 1 });
  });

  it("renders the later step once its answers are present", () => {
    expect(
      resolveWizardStep({
        requestedStep: 2,
        firstStep: 1,
        draftStatus: "found",
        prerequisitesMet: true,
      }),
    ).toEqual({ kind: "step", step: 2 });
  });

  it("WAITS while the saved answers are still being read back", () => {
    // The live defect: this window rendered a complete-looking step 2 built
    // from defaults, and Start created a Rulebook with no goal.
    expect(
      resolveWizardStep({
        requestedStep: 2,
        firstStep: 1,
        draftStatus: "loading",
        prerequisitesMet: false,
      }),
    ).toEqual({ kind: "loading" });
  });

  it("says the answers are LOST rather than silently dropping to step 1", () => {
    expect(
      resolveWizardStep({
        requestedStep: 2,
        firstStep: 1,
        draftStatus: "absent",
        prerequisitesMet: false,
      }),
    ).toEqual({ kind: "lost", requestedStep: 2 });
  });

  it("says LOST when a draft was found but did not carry the prerequisites", () => {
    expect(
      resolveWizardStep({
        requestedStep: 2,
        firstStep: 1,
        draftStatus: "found",
        prerequisitesMet: false,
      }),
    ).toEqual({ kind: "lost", requestedStep: 2 });
  });
});
