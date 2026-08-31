/**
 * P14, HELD — a behavioural promise is offerable only when it is factually
 * true, and it says why not.
 *
 * These assert the TRANSLATION and the SENTENCES, which are the two things this
 * repo owns. The eligibility FACT itself is `evaluateBindingAutoRun`, already
 * held by `features/surfaces/utils/__tests__` and shared with the surface bind
 * panel — re-testing it here would be a second copy of one rule.
 *
 * The guard that matters: a map that ASKS the person can never be eligible.
 * That is the sentence the mandate side could not say at all before
 * `mandate.binding.auto_run` existed, and it is the one the server re-checks.
 */

import { evaluateBindingAutoRun } from "@/features/surfaces/utils/binding-auto-run";
import {
  autoRunMappingsFor,
  autoRunSentence,
} from "@/features/bindings/AutoRunBar";
import type { ConsumptionMap } from "@/features/mandates/provision-shapes";

const TARGETS = [
  { name: "working_text", required: true },
  { name: "report_tone", required: false },
];

function verdict(map: ConsumptionMap) {
  return evaluateBindingAutoRun(TARGETS, autoRunMappingsFor(map));
}

describe("the job map → the shared eligibility fact", () => {
  it("is eligible when every required input is fed by the binding", () => {
    const map: ConsumptionMap = {
      working_text: [
        { mapType: "offered_value", target: "cleaned_transcript", deliver: "variable" },
      ],
    };
    expect(verdict(map).eligible).toBe(true);
    expect(autoRunSentence(verdict(map), true)).toBe(
      "Runs instantly — every input is mapped, nothing to ask",
    );
    expect(autoRunSentence(verdict(map), false)).toBe(
      "Waits for you to press Run",
    );
  });

  it("counts a fixed literal as fed — the binding supplies it", () => {
    const map: ConsumptionMap = {
      working_text: [{ mapType: "direct_value", target: "hello", deliver: "variable" }],
    };
    expect(verdict(map).eligible).toBe(true);
  });

  it("is NOT eligible when anything asks the person, and names it", () => {
    const map: ConsumptionMap = {
      working_text: [
        { mapType: "offered_value", target: "cleaned_transcript", deliver: "variable" },
      ],
      report_tone: [
        { mapType: "prompt_user", prompt: "Which tone?", deliver: "variable" },
      ],
    };
    const v = verdict(map);
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe("prompts_user");
    expect(autoRunSentence(v, false)).toBe(
      "Waits for you to press Run — this mapping asks for Report Tone",
    );
  });

  it("asks even when the question is one source of a many-to-one join (D18.2)", () => {
    const map: ConsumptionMap = {
      working_text: [
        { mapType: "offered_value", target: "cleaned_transcript", deliver: "variable" },
        { mapType: "prompt_user", prompt: "Anything to add?", deliver: "variable" },
      ],
    };
    expect(verdict(map).reason).toBe("prompts_user");
  });

  it("is NOT eligible while a required input is unfed, and names it", () => {
    const v = verdict({});
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe("missing_required");
    expect(autoRunSentence(v, false)).toBe(
      "Waits for you to press Run — Working Text is not mapped yet",
    );
  });

  it("treats a source still waiting for its pick as feeding nothing", () => {
    const map: ConsumptionMap = {
      working_text: [{ mapType: "offered_value", target: "", deliver: "variable" }],
    };
    expect(verdict(map).reason).toBe("missing_required");
  });
});
