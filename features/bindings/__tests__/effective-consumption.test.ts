/**
 * The Binding tab claims exactly what the run door feeds (2026-10-06).
 *
 * The server (aidream `provisions.materialize_consumption`) feeds every
 * by-name offered value to the input of the same name when the map is empty,
 * and ONLY the mapped entries otherwise. These cases pin both halves, plus the
 * words the summary prints for each.
 */

import { effectiveConsumption } from "../effective-consumption";
import { coverageLine, isFed } from "../words";
import { sourcesFor } from "../consumption-writer";
import type { ConsumptionMap, OfferedValue } from "@/features/mandates/provisions";

const offer = (name: string, guaranteed = true): OfferedValue => ({
  name,
  kind: "text",
  guaranteed,
  lazy: false,
  description: "",
});

const OFFERED = [offer("content"), offer("instructions", false), offer("page_title")];
const TARGETS = ["content", "instructions", "tone"];
const NO_CONTEXT: ReadonlySet<string> = new Set();

function fedCount(map: ConsumptionMap): number {
  return TARGETS.filter((t) => isFed(sourcesFor(map, t))).length;
}

describe("effectiveConsumption", () => {
  it("implicit: an empty map feeds every name match, as the server does", () => {
    const e = effectiveConsumption({
      map: {},
      targetNames: TARGETS,
      contextKeys: NO_CONTEXT,
      offered: OFFERED,
      holderKind: "agent",
    });
    expect([...e.byName].sort()).toEqual(["content", "instructions"]);
    expect(fedCount(e.map)).toBe(2);
    // "Make explicit" saves exactly this, optional value's absence decided.
    expect(e.implicit).toEqual({
      content: [{ mapType: "offered_value", target: "content", deliver: "variable" }],
      instructions: [
        {
          mapType: "offered_value",
          target: "instructions",
          deliver: "variable",
          when_absent: "skip",
        },
      ],
    });
    expect(
      coverageLine({
        hasHolder: true,
        inputsReady: true,
        totalInputs: 3,
        fedInputs: 2,
        byNameInputs: 2,
        askingInputs: 0,
        unfedRequired: 0,
        offeredCount: 3,
      }),
    ).toBe("2 of the 3 inputs this Mandate Holder needs are fed. All by name. The other 1 is not fed.");
  });

  it("explicit: a stored map is the whole truth, nothing arrives by name", () => {
    const map: ConsumptionMap = {
      content: [{ mapType: "offered_value", target: "page_title", deliver: "variable" }],
    };
    const e = effectiveConsumption({
      map,
      targetNames: TARGETS,
      contextKeys: NO_CONTEXT,
      offered: OFFERED,
      holderKind: "agent",
    });
    expect(e.byName.size).toBe(0);
    expect(e.map).toBe(map);
  });

  it("partial: a map naming one input leaves the other name match unfed", () => {
    const map: ConsumptionMap = {
      content: [{ mapType: "offered_value", target: "content", deliver: "variable" }],
    };
    const e = effectiveConsumption({
      map,
      targetNames: TARGETS,
      contextKeys: NO_CONTEXT,
      offered: OFFERED,
      holderKind: "agent",
    });
    expect(isFed(sourcesFor(e.map, "instructions"))).toBe(false);
    expect(fedCount(e.map)).toBe(1);
  });

  it("missing required: no offer of that name stays unfed and red", () => {
    const e = effectiveConsumption({
      map: {},
      targetNames: TARGETS,
      contextKeys: NO_CONTEXT,
      offered: OFFERED,
      holderKind: "agent",
    });
    expect(isFed(sourcesFor(e.map, "tone"))).toBe(false);
    expect(
      coverageLine({
        hasHolder: true,
        inputsReady: true,
        totalInputs: 3,
        fedInputs: 2,
        byNameInputs: 2,
        askingInputs: 0,
        unfedRequired: 1,
        offeredCount: 3,
      }),
    ).toContain("1 required input is still unmapped");
  });

  it("mapping-only offers and agent context slots are never fed by name", () => {
    const e = effectiveConsumption({
      map: {},
      targetNames: TARGETS,
      contextKeys: new Set(["instructions"]),
      offered: OFFERED,
      mappingOnly: new Set(["content"]),
      holderKind: "agent",
    });
    expect(e.byName.size).toBe(0);
    // A workflow Holder receives every supplied value by name.
    const wf = effectiveConsumption({
      map: {},
      targetNames: TARGETS,
      contextKeys: NO_CONTEXT,
      offered: OFFERED,
      mappingOnly: new Set(["content"]),
      holderKind: "workflow",
    });
    expect([...wf.byName].sort()).toEqual(["content", "instructions"]);
  });
});
