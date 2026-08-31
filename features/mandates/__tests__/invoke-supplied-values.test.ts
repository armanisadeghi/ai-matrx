/**
 * THE SEAM FOR "CODE INVOKES A MANDATE" (Arman, live, 2026-08-31).
 *
 * Refine-with-AI failed on every mandate with *"required agent value does not
 * exist in the calling code path"*. The caller passed four names it invented
 * (`mandate_key`, `mandate_label`, `current_goal`, `description`); the job
 * declares `task_overview`, `inputs`, `outputs`, `system_prompt`,
 * `full_agent_object` — synthesized from its described inputs — plus a
 * person-answered `brief` its binding asks for. Read out of the live DB:
 * `mandate.definition.draft_inputs` for goal_writer carries exactly those five
 * descriptions, and the user-rung binding live at the time mapped `brief` as
 * `prompt_user`.
 *
 * ⚠️ A CORRECTION WORTH KEEPING, because it nearly poisoned this fixture.
 * That binding (`39aff811`, holder "Masterwork Method Interrogator", prompt
 * "V1 parity probe: what brief?") was NOT Arman's — it was an adversarial
 * reviewer's leftover probe row, and several lanes including this one had been
 * treating it as his and protecting it. It was soft-deleted 2026-08-31 15:55Z,
 * and `mandate.goal_writer` now resolves through his real global binding to
 * "Agent Goal Writer". **Never infer a row's owner from its id — read
 * `created_by`.** The SHAPE these cases pin (a `prompt_user` source is served
 * as a named field with `origin: "binding_prompt"`) is a property of the
 * binding model, not of that row, so the fixture stands on its own.
 */

import { planInvocation, skippedSentence } from "../invoke/supplied-values";
import type { ServedInput } from "@/features/workflow-runtime/served-form/served-input";

function served(p: Partial<ServedInput> & { name: string }): ServedInput {
  return {
    kind: "text",
    sourcing: "optional",
    variant: null,
    default: null,
    label: p.name,
    help: "",
    placeholder: "",
    options: [],
    origin: "mandate_input",
    nodeId: null,
    ...p,
  } as ServedInput;
}

const GOAL_WRITER_SURFACE: ServedInput[] = [
  served({ name: "task_overview", label: "Task overview" }),
  served({ name: "inputs", label: "Inputs" }),
  served({ name: "outputs", label: "Outputs" }),
  served({ name: "system_prompt", label: "System prompt" }),
  served({ name: "full_agent_object", label: "Full agent object" }),
  served({
    name: "brief",
    label: "Brief",
    origin: "binding_prompt",
    sourcing: "ask",
  }),
];

describe("the caller supplies the job's OWN inputs, by served name", () => {
  test("THE REGRESSION: invented names send nothing at all", () => {
    const plan = planInvocation({
      inputs: GOAL_WRITER_SURFACE,
      known: {
        mandate_key: "x.y",
        mandate_label: "X",
        current_goal: "g",
        description: "d",
      },
    });
    // Not one of the four reached the wire — which is exactly why the run door
    // refused for a required value "that does not exist in the calling path".
    expect(plan.variables).toEqual({});
  });

  test("values held by served name are sent; unknown keys are ignored", () => {
    const plan = planInvocation({
      inputs: GOAL_WRITER_SURFACE,
      known: {
        task_overview: "Job: Refine me",
        inputs: "One described input",
        outputs: "Output kind: text",
        // A caller may know more than the job asked for. That is not an error.
        mandate_key: "should.not.be.sent",
      },
    });
    expect(plan.variables).toEqual({
      task_overview: "Job: Refine me",
      inputs: "One described input",
      outputs: "Output kind: text",
    });
    expect(plan.variables.mandate_key).toBeUndefined();
  });

  test("the binding's own question is ALWAYS asked, never answered from context", () => {
    const plan = planInvocation({
      inputs: GOAL_WRITER_SURFACE,
      // Even though the caller "holds" a brief, the person who bound this job
      // chose to be asked — answering it silently would overrule that.
      known: { brief: "a brief the caller invented" },
    });
    expect(plan.asks.map((a) => a.name)).toContain("brief");
    expect(plan.variables.brief).toBeUndefined();
  });

  test("a person's answer wins and reaches the wire", () => {
    const plan = planInvocation({
      inputs: GOAL_WRITER_SURFACE,
      known: { task_overview: "ctx" },
      answers: { brief: "  Make it tighter.  " },
    });
    expect(plan.variables.brief).toBe("Make it tighter.");
    expect(plan.asks.map((a) => a.name)).not.toContain("brief");
  });

  test("a REQUIRED input nothing holds is asked, not silently failed", () => {
    const plan = planInvocation({
      inputs: [served({ name: "must_have", sourcing: "require" })],
      known: {},
    });
    expect(plan.asks.map((a) => a.name)).toEqual(["must_have"]);
  });

  test("optional-and-unheld is recorded and SAID, never invisible", () => {
    const plan = planInvocation({
      inputs: GOAL_WRITER_SURFACE,
      known: { task_overview: "a", inputs: "b", outputs: "c" },
      answers: { brief: "d" },
    });
    expect(plan.skipped.map((s) => s.input.name)).toEqual([
      "system_prompt",
      "full_agent_object",
    ]);
    expect(skippedSentence(plan)).toBe(
      "Running without System prompt and Full agent object — this screen has nothing to put in them, and this job marks them optional.",
    );
    // And the run is not blocked by them.
    expect(plan.asks).toHaveLength(0);
  });

  test("nothing skipped means no sentence invented", () => {
    const plan = planInvocation({
      inputs: [served({ name: "a" })],
      known: { a: "1" },
    });
    expect(skippedSentence(plan)).toBe("");
  });

  test("whitespace is not a value", () => {
    const plan = planInvocation({
      inputs: [served({ name: "a" })],
      known: { a: "   " },
    });
    expect(plan.variables).toEqual({});
    expect(plan.skipped.map((s) => s.input.name)).toEqual(["a"]);
  });
});
