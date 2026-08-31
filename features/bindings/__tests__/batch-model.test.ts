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
  applyRefusal,
  placeHealth,
  reconcilePlaceMap,
  reconcileSentence,
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

  it("is AMBER — never red — when an optional input is mid-pick", () => {
    const health = placeHealth({
      targets: [TONE],
      offered: [CLEANED],
      map: {
        report_tone: [
          { mapType: "offered_value", target: "", deliver: "variable" },
        ],
      },
    });
    expect(health.tone).toBe("amber");
    expect(health.requiredUnmapped).toBe(0);
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

  it("lets a clean batch through", () => {
    expect(applyRefusal([green, green], 2)).toBeNull();
  });

  it("refuses an empty batch rather than pretending to write nothing", () => {
    expect(applyRefusal([], 0)).toContain("Nothing left to apply");
  });
});
