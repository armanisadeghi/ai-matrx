/**
 * A STEP TITLE IS A SENTENCE A PERSON READS — cold walk 22 (friction).
 *
 * The live panel of a Masterwork run printed, verbatim from its definition,
 * "Checking every finding cites a real rule — Diagnostics Before Quo" and
 * "the expert makes the final call". These are the walk's real node labels
 * (the compiler sliced the section name at 22 characters and templated a
 * lowercase author). `describeWorkflowSteps` is the one reader every run
 * surface uses, so the repair is asserted there.
 *
 * RED before the fix: both labels came back exactly as stored.
 */
import {
  describeWorkflowSteps,
  presentStepTitles,
} from "../node-presentation";
import type { WorkflowDefinitionLike } from "@/features/workflow-runtime/trigger-points";

const WALK_22_LABELS = [
  "Submit your text",
  "Checking your Diagnostics Before Quoting rules",
  "Checking every finding cites a real rule — Diagnostics Before Quo",
  "Confirmed: every finding cites a real rule — Diagnostics Before",
  "Checking your The Three Verdicts rules",
  "Applying the corrections",
  "the expert makes the final call",
  "Your result",
];

function definitionOf(labels: string[]): WorkflowDefinitionLike {
  return {
    nodes: labels.map((label, i) => ({
      id: `n${i}`,
      type: "ai.agent.run",
      data: { label },
    })),
    edges: [],
  } as unknown as WorkflowDefinitionLike;
}

describe("run step titles", () => {
  const titles = describeWorkflowSteps(definitionOf(WALK_22_LABELS)).map(
    (s) => s.label,
  );

  it("a section name cut mid-word is completed from the run's own words", () => {
    expect(titles).toContain(
      "Checking every finding cites a real rule — Diagnostics Before Quoting",
    );
    expect(titles.some((t) => /Before Quo$/.test(t))).toBe(false);
  });

  it("a title cut at a whole word is left as written — nothing is invented", () => {
    expect(titles).toContain(
      "Confirmed: every finding cites a real rule — Diagnostics Before",
    );
  });

  it("every title starts with a capital", () => {
    expect(titles).toContain("The expert makes the final call");
    for (const t of titles) expect(t.charAt(0)).toBe(t.charAt(0).toUpperCase());
  });

  it("a title's own closing word is never 'completed' into a sibling's", () => {
    expect(presentStepTitles(["Apply rule", "Apply rules"])).toEqual([
      "Apply rule",
      "Apply rules",
    ]);
  });
});
