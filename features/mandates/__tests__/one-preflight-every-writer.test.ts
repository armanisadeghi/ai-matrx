/**
 * ── ONE PRE-FLIGHT, EVERY WRITER (FIX-11, W10-1) ─────────────────────────────
 *
 * THE DEFECT, as a walker found it on production v0.4.1624: the pre-flight
 * printed its refusal on ALL surfaces, and exactly ONE of them honoured it.
 * Batch mode's Apply was genuinely disabled with the sentence beside it; the
 * single-place mandate screen showed the same warning with `disabled:false`
 * and wrote it; and the shortcut editor stored a Prompt-User mapping with a
 * BLANK question, answered `PATCH … 200`, and toasted success. A run form would
 * then have asked a question with no words — which nobody can answer.
 *
 * THE CLASS, and it is bigger than the two screens that were reported: a census
 * of every client-side writer of a `prompt_user`-capable mapping found NINE,
 * and one of them checked. The two shapes are different (`ConsumptionMap` for a
 * mandate binding, `ValueMappingMap` for a surface/shortcut binding) but the
 * same shared row component writes both, so a person can produce the same
 * unanswerable state on either side.
 *
 * THE FIX, in three layers, and this file guards all three:
 *   1. THE JUDGE is offer-independent. `consumptionMapProblems` used to REQUIRE
 *      an offer, so the mandate workspace skipped the whole pre-flight on a job
 *      that describes nothing. `null` now means "the offer is not known here"
 *      and silences only the four sentences that need it.
 *   2. THE CONTROLS are honest. Each editor derives its refusal and DISABLES
 *      its button with the sentence adjacent — the batch precedent.
 *   3. THE WRITE SEAMS refuse. `packShortcutMappingColumns` (every shortcut
 *      insert/update/bulk/pasted-JSON path) and `buildSurfaceBindingPayload`
 *      (every surface bind path) throw, so a writer that never grew a UI gate
 *      still cannot put an unanswerable mapping on the wire.
 *
 * 🚨 HOW TO PROVE THIS GUARD IS REAL. Revert any one of the three layers and
 * its block here fails — recorded in the register with both outputs.
 */

import {
  consumptionMapProblems,
  valueMappingsProblems,
  assertMappingsAreAnswerable,
  type ConsumptionMap,
  type OfferedValue,
} from "@/features/mandates/provision-shapes";
import { shortcutSaveRefusals } from "@/features/agent-shortcuts/save-refusal";
import { packShortcutMappingColumns } from "@/features/agents/redux/agent-shortcuts/converters";
import { buildSurfaceBindingPayload } from "@/features/surfaces/services/bind-agent-to-surface.service";
import type { ValueMappingMap } from "@/features/surfaces/types";

/** The state the walker produced: an input on Prompt User, question blank. */
const BLANK_QUESTION: ValueMappingMap = {
  task_overview: { mapType: "prompt_user", prompt: "   ", required: false },
};

const OFFERED: OfferedValue[] = [
  {
    name: "task_overview",
    kind: "text",
    guaranteed: true,
    lazy: false,
    description: "What the job is for.",
  },
];

describe("layer 1 — the judge runs without an offer", () => {
  const map: ConsumptionMap = {
    task_overview: [{ mapType: "prompt_user", prompt: "  ", deliver: "variable" }],
  };

  it("refuses a question with no words even when the job offers nothing", () => {
    // 🚨 THE REGRESSION ITSELF. The mandate workspace gated the whole pre-flight
    // on `offer && holderChosen`, and a job that describes nothing HAS no offer
    // — so Save sat enabled beside the row's own warning.
    const problems = consumptionMapProblems(null, map, {
      targets: [{ name: "task_overview", label: "Task Overview" }],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Task Overview");
    expect(problems[0]).toContain("has no question");
    // R5-1 stays closed: no machine key inside a person's sentence.
    expect(problems[0]).not.toContain("task_overview");
  });

  it("says nothing it cannot know when the offer is unknown", () => {
    // "…which this job does not offer" is a CLAIM about the offer. With no
    // offer in hand it is not a truth, and a screen that says it anyway lies.
    const consuming: ConsumptionMap = {
      holder_input: [
        { mapType: "offered_value", target: "task_overview", deliver: "variable" },
      ],
    };
    expect(consumptionMapProblems(null, consuming, {})).toEqual([]);
    // …and with the offer in hand it still speaks, so this is not vacuous.
    expect(consumptionMapProblems({ values: [] }, consuming, {})).toHaveLength(1);
    expect(consumptionMapProblems({ values: OFFERED }, consuming, {})).toEqual([]);
  });

  it("keeps the offer-fed sentences working when the offer IS known", () => {
    const optional: ConsumptionMap = {
      holder_input: [
        { mapType: "offered_value", target: "maybe", deliver: "variable" },
      ],
    };
    const problems = consumptionMapProblems(
      {
        values: [
          {
            name: "maybe",
            kind: "text",
            guaranteed: false,
            lazy: false,
            description: "",
          },
        ],
      },
      optional,
      {},
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("choose what happens when it is absent");
  });
});

describe("layer 1b — the same judge reads the other map shape", () => {
  it("refuses a shortcut/surface mapping whose question has no words", () => {
    const problems = valueMappingsProblems(BLANK_QUESTION, {
      targets: [{ name: "task_overview", label: "Task Overview" }],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Task Overview");
    expect(problems[0]).toContain("has no question");
  });

  it("does not invent the mandate's two-channel sentences for a surface map", () => {
    // A surface binding has ONE delivery channel, so "deliver it as context"
    // and "sources going to different places" are not truths about it.
    const structuredLiteral: ValueMappingMap = {
      payload: { mapType: "direct_value", target: { a: 1 } },
    };
    expect(valueMappingsProblems(structuredLiteral)).toEqual([]);
    // The mandate side, which HAS two channels, still says it.
    expect(
      consumptionMapProblems(null, {
        payload: [
          { mapType: "direct_value", target: { a: 1 }, deliver: "variable" },
        ],
      }),
    ).toHaveLength(1);
  });

  it("is quiet about a well-formed mapping and about no mapping at all", () => {
    expect(valueMappingsProblems(null)).toEqual([]);
    expect(
      valueMappingsProblems({
        task_overview: { mapType: "prompt_user", prompt: "What is the goal?" },
        other: { mapType: "unmapped" },
      }),
    ).toEqual([]);
  });
});

describe("layer 2 — the control is honest before it is pressed", () => {
  const targets = [{ name: "task_overview", label: "Task Overview" }];

  it("refuses the shortcut editor's Save while the question is blank", () => {
    const refusals = shortcutSaveRefusals({
      label: "ZZZ scratch",
      categoryId: "cat-1",
      surfaceName: "matrx-default/default",
      valueMappings: BLANK_QUESTION,
      targets,
    });
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain("has no question");
  });

  it("lets a complete shortcut through — the gate is not a wall", () => {
    expect(
      shortcutSaveRefusals({
        label: "ZZZ scratch",
        categoryId: "cat-1",
        surfaceName: "matrx-default/default",
        valueMappings: {
          task_overview: { mapType: "prompt_user", prompt: "What is the goal?" },
        },
        targets,
      }),
    ).toEqual([]);
  });

  it("still names the three frame fields, one at a time", () => {
    const base = {
      label: "",
      categoryId: null,
      surfaceName: null,
      valueMappings: BLANK_QUESTION,
      targets,
    };
    expect(shortcutSaveRefusals(base)[0]).toContain("label");
    expect(shortcutSaveRefusals({ ...base, label: "x" })[0]).toContain(
      "category",
    );
    expect(
      shortcutSaveRefusals({ ...base, label: "x", categoryId: "c" })[0],
    ).toContain("surface");
  });
});

describe("layer 3 — the write seams refuse what no UI gate caught", () => {
  it("a shortcut insert/update cannot carry an unanswerable question", () => {
    expect(() => packShortcutMappingColumns(BLANK_QUESTION, null)).toThrow(
      /has no question/,
    );
  });

  it("a surface binding payload cannot carry one either", () => {
    expect(() =>
      buildSurfaceBindingPayload({ valueMappings: BLANK_QUESTION }),
    ).toThrow(/has no question/);
  });

  it("both seams pass a well-formed map straight through", () => {
    // Anti-vacuity: a seam that threw on everything would pass the two above.
    const good: ValueMappingMap = {
      task_overview: { mapType: "prompt_user", prompt: "What is the goal?" },
    };
    expect(packShortcutMappingColumns(good, null)).toBeTruthy();
    expect(buildSurfaceBindingPayload({ valueMappings: good })).toEqual({
      value_mappings: good,
    });
  });

  it("the seam's refusal is a sentence, not a stack trace", () => {
    let message = "";
    try {
      assertMappingsAreAnswerable(BLANK_QUESTION, {
        targets: [{ name: "task_overview", label: "Task Overview" }],
      });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain("Task Overview");
    expect(message).toContain("write what the run form should say");
    expect(message).not.toMatch(/[a-z]+_[a-z]+/);
  });
});
