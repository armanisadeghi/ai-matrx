/**
 * BATCH MODE'S RULES, HELD.
 *
 * The three things a batch grid must get right, per UI-STANDARD P17, asserted
 * against the SAME validators the single-place save runs through — never
 * against a copy of them:
 *
 *   · a mapping copied to a place is reconciled against THAT place's offer
 *     (keep · re-bind on a name match · clear and go red);
 *   · a row's health is red exactly when the row cannot be written;
 *   · Apply is refused, in words, with the count.
 */

import type { BindingTarget } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import type {
  ConsumptionMap,
  OfferedValue,
} from "@/features/mandates/provision-shapes";
import { reconcileCopiedTarget } from "@/features/agent-shortcuts/components/batch/BatchBindingCell";
import {
  applyBulkSelection,
  applyRefusal,
  batchScopeSentence,
  bulkSelectionLabel,
  placeHealth,
  reconcilePlaceMap,
  reconcileSentence,
  unfedRequiredTargets,
} from "@/features/bindings/batch/batch-model";

const CLEANED: OfferedValue = {
  name: "cleaned_transcript",
  description: "A cleaned transcript.",
  kind: "text",
  guaranteed: true,
  lazy: false,
};
const SOMETIMES: OfferedValue = {
  name: "session_title",
  description: "The session title when available.",
  kind: "text",
  guaranteed: false,
  lazy: false,
};
const WORKING_TEXT: BindingTarget = {
  name: "working_text",
  label: "Working Text",
  required: true,
};
const TONE: BindingTarget = { name: "report_tone", label: "Report Tone" };

describe("the copied-mapping rule (P17.2)", () => {
  it("keeps an inherited value the place actually offers", () => {
    expect(
      reconcileCopiedTarget({
        inheritedTarget: "cleaned_transcript",
        targetName: "working_text",
        availableNames: ["cleaned_transcript"],
      }),
    ).toEqual({ action: "keep" });
  });

  it("re-binds to a value named like the input when the inherited one is absent", () => {
    expect(
      reconcileCopiedTarget({
        inheritedTarget: "cleaned_transcript",
        targetName: "working_text",
        availableNames: ["working_text", "session_title"],
      }),
    ).toEqual({ action: "rebind", target: "working_text" });
  });

  it("clears when neither exists — the cell goes red and the person picks", () => {
    expect(
      reconcileCopiedTarget({
        inheritedTarget: "cleaned_transcript",
        targetName: "working_text",
        availableNames: ["session_title"],
      }),
    ).toEqual({ action: "clear", target: "" });
  });
});

describe("reconcilePlaceMap", () => {
  const map: ConsumptionMap = {
    working_text: [
      { mapType: "offered_value", target: "cleaned_transcript", deliver: "variable" },
      { mapType: "offered_value", target: "session_title", deliver: "variable" },
    ],
    report_tone: [
      { mapType: "direct_value", target: "brisk", deliver: "variable" },
    ],
  };

  it("carries a literal to every place untouched", () => {
    const report = reconcilePlaceMap({
      map,
      targets: [WORKING_TEXT, TONE],
      offered: [],
    });
    expect(report.map.report_tone).toEqual([
      { mapType: "direct_value", target: "brisk", deliver: "variable" },
    ]);
  });

  it("re-binds source 0 on a name match and drops an extra this place lacks", () => {
    const report = reconcilePlaceMap({
      map,
      targets: [WORKING_TEXT, TONE],
      offered: [{ ...CLEANED, name: "working_text" }],
    });
    expect(report.map.working_text).toEqual([
      { mapType: "offered_value", target: "working_text", deliver: "variable" },
    ]);
    expect(report.rebound).toContain("Working Text");
    expect(report.cleared).toContain("Working Text");
  });

  it("clears source 0 when the place offers nothing that fits, and says so", () => {
    const report = reconcilePlaceMap({
      map: {
        working_text: [
          {
            mapType: "offered_value",
            target: "cleaned_transcript",
            deliver: "variable",
          },
        ],
      },
      targets: [WORKING_TEXT],
      offered: [SOMETIMES],
    });
    expect(report.map.working_text).toEqual([
      { mapType: "offered_value", target: "", deliver: "variable" },
    ]);
    expect(reconcileSentence(report)).toContain("cleared 1 input");
  });

  it("re-decides the absence answer against THIS place's guarantee (P9)", () => {
    const report = reconcilePlaceMap({
      map: {
        working_text: [
          {
            mapType: "offered_value",
            target: "session_title",
            deliver: "variable",
          },
        ],
      },
      targets: [WORKING_TEXT],
      offered: [SOMETIMES],
    });
    expect(report.map.working_text[0]).toMatchObject({ when_absent: "skip" });
  });
});

describe("placeHealth", () => {
  it("is green when every input is answered", () => {
    const health = placeHealth({
      targets: [WORKING_TEXT],
      offered: [CLEANED],
      map: {
        working_text: [
          {
            mapType: "offered_value",
            target: "cleaned_transcript",
            deliver: "variable",
          },
        ],
      },
    });
    expect(health.tone).toBe("green");
  });

  it("is RED when a required input is mid-pick, and counts it", () => {
    const health = placeHealth({
      targets: [WORKING_TEXT],
      offered: [CLEANED],
      map: {
        working_text: [
          { mapType: "offered_value", target: "", deliver: "variable" },
        ],
      },
    });
    expect(health.tone).toBe("red");
    expect(health.requiredUnmapped).toBe(1);
  });

  it("is RED for an OPTIONAL input mid-pick too — an empty pick is refused", () => {
    // Map mode's Save says the same thing about the same map ("One input is
    // still waiting for you to pick…"), and the server 422s on an empty
    // target. Colour and gate must agree.
    const health = placeHealth({
      targets: [TONE],
      offered: [CLEANED],
      map: {
        report_tone: [
          { mapType: "offered_value", target: "", deliver: "variable" },
        ],
      },
    });
    expect(health.tone).toBe("red");
    expect(health.unmapped).toBe(1);
    expect(health.requiredUnmapped).toBe(0);
  });

  it("is AMBER — never red — when a required input has nothing feeding it", () => {
    const health = placeHealth({
      targets: [WORKING_TEXT],
      offered: [CLEANED],
      map: {},
    });
    expect(health.tone).toBe("amber");
    expect(health.unfedRequired).toEqual(["Working Text"]);
  });

  it("carries the SAME map problems the save's pre-flight raises", () => {
    const health = placeHealth({
      targets: [WORKING_TEXT],
      offered: [SOMETIMES],
      map: {
        working_text: [
          {
            mapType: "offered_value",
            target: "session_title",
            deliver: "variable",
          },
        ],
      },
    });
    // `session_title` is not guaranteed and no absence answer is set.
    expect(health.tone).toBe("red");
    expect(health.problems.join(" ")).toContain("optional");
  });

  it("is red with the gate's reason when the holder cannot fulfil the place", () => {
    const health = placeHealth({
      targets: [],
      offered: [],
      map: {},
      blockers: ["This agent does not declare what the job passes."],
    });
    expect(health.tone).toBe("red");
    expect(health.blockers).toHaveLength(1);
  });
});

describe("applyRefusal — the words, with the count", () => {
  const red = placeHealth({
    targets: [WORKING_TEXT],
    offered: [CLEANED],
    map: {
      working_text: [
        { mapType: "offered_value", target: "", deliver: "variable" },
      ],
    },
  });
  const green = placeHealth({
    targets: [WORKING_TEXT],
    offered: [CLEANED],
    map: {
      working_text: [
        {
          mapType: "offered_value",
          target: "cleaned_transcript",
          deliver: "variable",
        },
      ],
    },
  });

  it("refuses while any red cell stands, naming the count", () => {
    expect(applyRefusal([red, green], 2)).toBe(
      "1 required input is still unmapped. Fix the red cells first.",
    );
  });

  it("pluralizes honestly", () => {
    expect(applyRefusal([red, red], 2)).toBe(
      "2 required inputs are still unmapped. Fix the red cells first.",
    );
  });

  it("names an optional mid-pick in its own words rather than calling it required", () => {
    const optionalMidPick = placeHealth({
      targets: [TONE],
      offered: [CLEANED],
      map: {
        report_tone: [
          { mapType: "offered_value", target: "", deliver: "variable" },
        ],
      },
    });
    expect(applyRefusal([optionalMidPick], 1)).toBe(
      "1 input is still waiting for you to pick which offered value feeds it. Fix the red cells first.",
    );
  });

  it("lets a clean batch through", () => {
    expect(applyRefusal([green, green], 2)).toBeNull();
  });

  it("refuses an empty batch rather than pretending to write nothing", () => {
    expect(applyRefusal([], 0)).toContain("Nothing left to apply");
  });
});

/**
 * THE PICKER'S WORDS AND ITS ALGEBRA.
 *
 * A bulk control that says "these" while taking every filtered row, and a
 * sentence that promises the opened job is in after the batch was cleared, are
 * the same defect: the screen saying something that is not true right now.
 */
describe("bulkSelectionLabel", () => {
  it("states the real number and the real scope for every job", () => {
    expect(
      bulkSelectionLabel({
        matching: 683,
        filtered: false,
        allMatchingSelected: false,
      }),
    ).toBe("Select all 683 jobs");
  });

  it("says matches, not jobs, while a search narrows the list", () => {
    expect(
      bulkSelectionLabel({
        matching: 12,
        filtered: true,
        allMatchingSelected: false,
      }),
    ).toBe("Select all 12 matches");
  });

  it("names the inverse with the same number and scope", () => {
    expect(
      bulkSelectionLabel({
        matching: 683,
        filtered: false,
        allMatchingSelected: true,
      }),
    ).toBe("Clear all 683 jobs");
  });

  it("does not say 'all 1'", () => {
    expect(
      bulkSelectionLabel({
        matching: 1,
        filtered: true,
        allMatchingSelected: false,
      }),
    ).toBe("Select the 1 match");
  });
});

describe("applyBulkSelection", () => {
  it("adds the matching rows without disturbing picks outside the search", () => {
    expect(
      applyBulkSelection({
        selected: ["a", "z"],
        matchingKeys: ["a", "b", "c"],
        add: true,
      }),
    ).toEqual(["a", "z", "b", "c"]);
  });

  it("clears ONLY the matching rows — a hidden pick survives", () => {
    expect(
      applyBulkSelection({
        selected: ["a", "z"],
        matchingKeys: ["a", "b"],
        add: false,
      }),
    ).toEqual(["z"]);
  });
});

describe("batchScopeSentence", () => {
  it("stops claiming the opened job is in once it has been cleared out", () => {
    const sentence = batchScopeSentence({
      selectedCount: 3,
      openedIn: false,
      openedKey: "education.quiz_generate",
    });
    expect(sentence).toContain("is not one of them");
    expect(sentence).toContain("education.quiz_generate");
    expect(sentence).not.toContain("The one you opened is in");
  });

  it("says the batch is empty rather than implying Apply would do something", () => {
    expect(
      batchScopeSentence({
        selectedCount: 0,
        openedIn: false,
        openedKey: "education.quiz_generate",
      }),
    ).toContain("Apply has nothing to write");
  });

  it("counts the others when the opened job is in", () => {
    expect(
      batchScopeSentence({
        selectedCount: 1,
        openedIn: true,
        openedKey: "k",
      }),
    ).toContain("Only the one you opened is in.");
    expect(
      batchScopeSentence({ selectedCount: 4, openedIn: true, openedKey: "k" }),
    ).toContain("with 3 others");
  });
});

/**
 * 🚨 THE AMBER HOLE — V3 finding F3 (H1), pinned.
 *
 * The correctness adversary watched the grid print, in words, that a required
 * input had nothing feeding it, count it in "1 need attention", and then let an
 * ENABLED `Apply 2` write both places — one of them landing with
 * `consumption_map = {}` while the screen went on complaining about the very
 * inputs it had failed to feed.
 *
 * Why the two build lanes recorded this as proven: BOTH of their proofs used a
 * RED row (a cell mid-pick, and the requirement gate's blocker), and both of
 * those already had an `applyRefusal` branch. The AMBER class — required, unfed,
 * no holder default — never had one. The rule these tests hold is the general
 * one, so no class of stated problem can slip through again: anything the grid
 * says about a row, in red or in amber, refuses Apply with a sentence.
 */
describe("H1 — every stated problem refuses Apply", () => {
  const REQUIRED_NO_DEFAULT: BindingTarget = {
    name: "instructions",
    label: "Instructions",
    required: true,
  };

  it("refuses a required input nothing feeds, where the holder has no default", () => {
    const health = placeHealth({
      targets: [REQUIRED_NO_DEFAULT],
      offered: [CLEANED],
      map: {},
    });
    expect(health.unfedRequired).toEqual(["Instructions"]);
    expect(health.tone).toBe("amber");
    const refusal = applyRefusal([health], 1);
    expect(refusal).not.toBeNull();
    expect(refusal).toContain("nothing feeding it");
    expect(refusal).toContain("cannot run");
  });

  it("does NOT refuse when the holder has a default of its own", () => {
    const health = placeHealth({
      targets: [{ ...REQUIRED_NO_DEFAULT, defaultValue: "do the thing" }],
      offered: [CLEANED],
      map: {},
    });
    expect(health.unfedRequired).toEqual([]);
    expect(applyRefusal([health], 1)).toBeNull();
  });

  it("THE GENERAL RULE: any row that states a problem refuses Apply", () => {
    const states: ReturnType<typeof placeHealth>[] = [
      // mid-pick (red)
      placeHealth({
        targets: [WORKING_TEXT],
        offered: [CLEANED],
        map: {
          working_text: [
            { mapType: "offered_value", target: "", deliver: "variable" },
          ],
        },
      }),
      // a map the server would refuse (red)
      placeHealth({
        targets: [WORKING_TEXT],
        offered: [],
        map: {
          working_text: [
            {
              mapType: "offered_value",
              target: "not_offered_here",
              deliver: "variable",
            },
          ],
        },
      }),
      // the requirement gate (red)
      placeHealth({
        targets: [WORKING_TEXT],
        offered: [CLEANED],
        map: {},
        blockers: ["This holder cannot produce what the job promises."],
      }),
      // required, unfed, no default (amber) — the class that leaked
      placeHealth({
        targets: [REQUIRED_NO_DEFAULT],
        offered: [CLEANED],
        map: {},
      }),
    ];
    for (const health of states) {
      const stated =
        health.unmapped +
        health.problems.length +
        health.blockers.length +
        health.unfedRequired.length;
      expect(stated).toBeGreaterThan(0);
      expect(applyRefusal([health], 1)).not.toBeNull();
    }
  });
});

/**
 * H3 / V3 F4 — a place whose offer has not been read asserts NOTHING about
 * what feeds it. The grid used to be handed `offered: []` while the read was in
 * flight and stated, as fact, that a mapped required input was unfed.
 */
describe("H3 — an unread place has a reason, not a verdict", () => {
  const REQUIRED: BindingTarget = {
    name: "instructions",
    label: "Instructions",
    required: true,
  };
  const MAPPED: ConsumptionMap = {
    instructions: [
      { mapType: "offered_value", target: "cleaned_transcript", deliver: "variable" },
    ],
  };

  it("claims nothing while the offer is still being read", () => {
    const health = placeHealth({
      targets: [REQUIRED],
      offered: [],
      map: MAPPED,
      offerStatus: "loading",
    });
    expect(health.unfedRequired).toEqual([]);
    expect(health.problems).toEqual([]);
    expect(health.unknown).toContain("Still reading");
    expect(applyRefusal([health], 1)).toContain("not been read yet");
  });

  it("carries the read's own failure words when it failed", () => {
    const health = placeHealth({
      targets: [REQUIRED],
      offered: [],
      map: MAPPED,
      offerStatus: "error",
      offerMessage: "No organization is selected, so this place's offer cannot be read.",
    });
    expect(health.tone).toBe("red");
    expect(health.unknown).toContain("No organization is selected");
    expect(health.problems).toEqual([]);
  });

  it("judges normally once the offer is real", () => {
    const health = placeHealth({
      targets: [REQUIRED],
      offered: [CLEANED],
      map: MAPPED,
      offerStatus: "ready",
    });
    expect(health.unknown).toBeNull();
    expect(health.tone).toBe("green");
  });
});

/**
 * THE OVER-BLOCK THIS GATE MUST NOT CAUSE.
 *
 * Caught while building H1's refusal, before it shipped past a walk: "required
 * and nothing feeds it" is only true if nothing feeds it AT RUN TIME. A mandate
 * whose own contract declares a variable passes it at launch — that is the very
 * mechanism V3's `resolve_mandated_agent_start` refusal names — so a binding
 * that leaves such an input unmapped runs perfectly, and refusing to save it
 * would be a worse defect than the one the gate exists to stop.
 */
describe("H1 — a value the job's caller supplies is not unfed", () => {
  const CALLER_FED: BindingTarget = {
    name: "task_overview",
    label: "Task Overview",
    required: true,
  };

  it("does not name a caller-supplied input as unfed", () => {
    expect(
      unfedRequiredTargets({
        targets: [CALLER_FED],
        map: {},
        suppliedByCaller: ["task_overview"],
      }),
    ).toEqual([]);
    const health = placeHealth({
      targets: [CALLER_FED],
      offered: [CLEANED],
      map: {},
      suppliedByCaller: ["task_overview"],
    });
    expect(health.tone).toBe("green");
    expect(applyRefusal([health], 1)).toBeNull();
  });

  it("still names one the caller does NOT supply", () => {
    expect(
      unfedRequiredTargets({
        targets: [CALLER_FED],
        map: {},
        suppliedByCaller: ["something_else"],
      }),
    ).toEqual(["Task Overview"]);
  });
});
