/**
 * THE ONE WRITER, held. Every rule the one binding UI relies on when it edits a
 * consumption map is asserted here, because the map's shape is still moving and
 * a shape change must break a test before it breaks a binding.
 *
 * These are NOT tests of manufactured data through the author's own renderer:
 * every expectation below is the shape `consumptionMapForApi` puts on the wire
 * and `validate_consumption_map` reads on the server.
 */

import type { ValueMapping } from "@/features/surfaces/types";
import type {
  ConsumptionMap,
  OfferedValue,
} from "@/features/mandates/provision-shapes";
import {
  addSource,
  applyRowMapping,
  buildEntry,
  mappingForRow,
  applySuggestions,
  moveSource,
  removeSourceAt,
  seedAutoBinds,
  setSources,
  sourcesFor,
} from "@/features/bindings/consumption-writer";

const GUARANTEED: OfferedValue = {
  name: "cleaned_transcript",
  kind: "text",
  guaranteed: true,
  lazy: false,
  description: "The cleaned transcript.",
};
const OPTIONAL: OfferedValue = {
  name: "session_title",
  kind: "string",
  guaranteed: false,
  lazy: false,
  description: "The session's title, when there is one.",
};
const STRUCTURED: OfferedValue = {
  name: "session_context",
  kind: "matrx.session_context",
  guaranteed: true,
  lazy: false,
  description: "Everything known about the session.",
};

/** The offered-value NAMES a target is fed from, in order — the only reader a
 * test needs, and it never touches a branch that has no `target`. */
function sourceNames(map: ConsumptionMap, target: string): string[] {
  return sourcesFor(map, target).map((entry) =>
    entry.mapType === "offered_value" ? entry.target : `<${entry.mapType}>`,
  );
}

const OFFERED = new Map<string, OfferedValue>([
  [GUARANTEED.name, GUARANTEED],
  [OPTIONAL.name, OPTIONAL],
  [STRUCTURED.name, STRUCTURED],
]);

describe("buildEntry", () => {
  it("decides absence up front for a value that is not guaranteed", () => {
    expect(
      buildEntry({
        sourceName: OPTIONAL.name,
        offered: OPTIONAL,
        deliver: "variable",
      }),
    ).toEqual({
      mapType: "offered_value",
      target: "session_title",
      deliver: "variable",
      when_absent: "skip",
    });
  });

  it("leaves a guaranteed value without an absence answer — there is none to give", () => {
    const entry = buildEntry({
      sourceName: GUARANTEED.name,
      offered: GUARANTEED,
      deliver: "variable",
    });
    expect(entry.when_absent).toBeUndefined();
  });

  it("carries the context channel for a context slot (D18.3)", () => {
    expect(
      buildEntry({
        sourceName: STRUCTURED.name,
        offered: STRUCTURED,
        deliver: "context",
      }).deliver,
    ).toBe("context");
  });
});

describe("many-to-one (D18.2)", () => {
  it("appends sources in order and never duplicates one", () => {
    let map: ConsumptionMap = {};
    map = addSource(map, "working_text", {
      sourceName: GUARANTEED.name,
      offered: GUARANTEED,
      deliver: "variable",
    });
    map = addSource(map, "working_text", {
      sourceName: OPTIONAL.name,
      offered: OPTIONAL,
      deliver: "variable",
    });
    // The same value twice would be the same paragraph twice.
    map = addSource(map, "working_text", {
      sourceName: OPTIONAL.name,
      offered: OPTIONAL,
      deliver: "variable",
    });
    expect(sourceNames(map, "working_text")).toEqual([
      "cleaned_transcript",
      "session_title",
    ]);
  });

  it("reorders sources, because order IS the concatenation order", () => {
    let map: ConsumptionMap = {};
    map = addSource(map, "working_text", {
      sourceName: GUARANTEED.name,
      offered: GUARANTEED,
      deliver: "variable",
    });
    map = addSource(map, "working_text", {
      sourceName: OPTIONAL.name,
      offered: OPTIONAL,
      deliver: "variable",
    });
    map = moveSource(map, "working_text", 1, -1);
    expect(sourceNames(map, "working_text")).toEqual([
      "session_title",
      "cleaned_transcript",
    ]);
  });

  it("refuses to move past either end rather than wrapping silently", () => {
    const map = setSources({}, "x", [
      buildEntry({ sourceName: "a", offered: undefined, deliver: "variable" }),
    ]);
    expect(moveSource(map, "x", 0, -1)).toBe(map);
    expect(moveSource(map, "x", 0, 1)).toBe(map);
  });

  it("drops the target entirely when its last source is removed — an empty list is refused on the wire", () => {
    let map = setSources({}, "x", [
      buildEntry({ sourceName: "a", offered: undefined, deliver: "variable" }),
    ]);
    map = removeSourceAt(map, "x", 0);
    expect(Object.prototype.hasOwnProperty.call(map, "x")).toBe(false);
  });
});

describe("the codec the shared row talks through", () => {
  it("shows source 0 to the row as the branch its picker edits", () => {
    const map = setSources({}, "working_text", [
      buildEntry({
        sourceName: GUARANTEED.name,
        offered: GUARANTEED,
        deliver: "variable",
      }),
    ]);
    expect(mappingForRow(sourcesFor(map, "working_text"))).toEqual({
      mapType: "surface_value",
      target: "cleaned_transcript",
      required: false,
    });
  });

  it("shows an unfed input as undefined, so the row opens on the holder default", () => {
    expect(mappingForRow([])).toBeUndefined();
  });

  it("writes source 0 back without disturbing the sources joined after it", () => {
    let map = setSources({}, "working_text", [
      buildEntry({
        sourceName: GUARANTEED.name,
        offered: GUARANTEED,
        deliver: "variable",
      }),
      buildEntry({
        sourceName: OPTIONAL.name,
        offered: OPTIONAL,
        deliver: "variable",
      }),
    ]);
    const result = applyRowMapping({
      map,
      targetName: "working_text",
      mapping: {
        mapType: "surface_value",
        target: "session_context",
        required: true,
      },
      offeredByName: OFFERED,
      deliver: "variable",
    });
    map = result;
    expect(sourcesFor(map, "working_text")).toEqual([
      {
        mapType: "offered_value",
        target: "session_context",
        deliver: "variable",
        required: true,
      },
      {
        mapType: "offered_value",
        target: "session_title",
        deliver: "variable",
        when_absent: "skip",
      },
    ]);
  });

  it("clears the whole input when the row chooses the holder default", () => {
    const map = setSources({}, "working_text", [
      buildEntry({
        sourceName: GUARANTEED.name,
        offered: GUARANTEED,
        deliver: "variable",
      }),
    ]);
    const result = applyRowMapping({
      map,
      targetName: "working_text",
      mapping: { mapType: "unmapped" },
      offeredByName: OFFERED,
      deliver: "variable",
    });
    expect(sourcesFor(result, "working_text")).toEqual([]);
  });
});

describe("all four sources store — the stopgap is gone", () => {
  const cases: [string, ValueMapping, ConsumptionMap["x"]][] = [
    [
      "a fixed literal is the binding's own content",
      { mapType: "direct_value", target: "hello" },
      [{ mapType: "direct_value", target: "hello", deliver: "variable" }],
    ],
    [
      "asking the person is a stored source, not a refusal",
      { mapType: "prompt_user", prompt: "Which report tone?", required: true },
      [
        {
          mapType: "prompt_user",
          prompt: "Which report tone?",
          deliver: "variable",
          required: true,
        },
      ],
    ],
    [
      "the holder's own default is ABSENCE, never an entry",
      { mapType: "unmapped" },
      [],
    ],
  ];

  it.each(cases)("%s", (_name, mapping, expected) => {
    const map = applyRowMapping({
      map: {},
      targetName: "report_tone",
      mapping,
      offeredByName: OFFERED,
      deliver: "variable",
    });
    expect(sourcesFor(map, "report_tone")).toEqual(expected);
  });

  it("stamps the TARGET's channel on a literal, so a context slot can take one", () => {
    const map = applyRowMapping({
      map: {},
      targetName: "session_context",
      mapping: { mapType: "direct_value", target: "fixed" },
      offeredByName: OFFERED,
      deliver: "context",
    });
    expect(sourcesFor(map, "session_context")[0].deliver).toBe("context");
  });

  it("keeps the joined extras when only source 0 changes", () => {
    let map = applyRowMapping({
      map: {},
      targetName: "working_text",
      mapping: { mapType: "surface_value", target: GUARANTEED.name },
      offeredByName: OFFERED,
      deliver: "variable",
    });
    map = addSource(map, "working_text", {
      sourceName: OPTIONAL.name,
      offered: OPTIONAL,
      deliver: "variable",
    });
    map = applyRowMapping({
      map,
      targetName: "working_text",
      mapping: { mapType: "direct_value", target: "a literal instead" },
      offeredByName: OFFERED,
      deliver: "variable",
    });
    expect(sourceNames(map, "working_text")).toEqual([
      "<direct_value>",
      "session_title",
    ]);
  });
});

describe("the AI map's accept (P11) — proposed, never applied blind", () => {
  it("fills the manual editor, combinations and all, in the proposal's order", () => {
    const map = applySuggestions({
      map: {},
      suggestions: [
        {
          target: "working_text",
          mapping: { mapType: "surface_value", target: GUARANTEED.name },
          alsoFrom: [OPTIONAL.name],
        },
      ],
      targetNames: ["working_text"],
      offeredByName: OFFERED,
      deliverFor: () => "variable",
    });
    expect(sourceNames(map, "working_text")).toEqual([
      "cleaned_transcript",
      "session_title",
    ]);
    // D18.2 — the joined source declares its absence answer like any other.
    expect(sourcesFor(map, "working_text")[1]).toMatchObject({
      when_absent: "skip",
    });
  });

  it("refuses a target the holder does not have — the model never invents a row", () => {
    const map = applySuggestions({
      map: {},
      suggestions: [
        {
          target: "invented_input",
          mapping: { mapType: "surface_value", target: GUARANTEED.name },
          alsoFrom: [],
        },
      ],
      targetNames: ["working_text"],
      offeredByName: OFFERED,
      deliverFor: () => "variable",
    });
    expect(map).toEqual({});
  });

  it("never wipes what is already mapped for a target it says nothing about", () => {
    const stored = setSources({}, "working_text", [
      buildEntry({
        sourceName: GUARANTEED.name,
        offered: GUARANTEED,
        deliver: "variable",
      }),
    ]);
    const map = applySuggestions({
      map: stored,
      suggestions: [],
      targetNames: ["working_text"],
      offeredByName: OFFERED,
      deliverFor: () => "variable",
    });
    expect(map).toEqual(stored);
  });
});

describe("the productive empty state (P4)", () => {
  it("seeds an exact name match and reports which inputs it filled", () => {
    const seeded = seedAutoBinds({
      map: {},
      targetNames: ["cleaned_transcript", "unrelated_input"],
      offeredByName: OFFERED,
      deliverFor: () => "variable",
    });
    expect([...seeded.autoBound]).toEqual(["cleaned_transcript"]);
    expect(sourcesFor(seeded.map, "cleaned_transcript")).toHaveLength(1);
    expect(sourcesFor(seeded.map, "unrelated_input")).toHaveLength(0);
  });

  it("never overwrites a stored mapping", () => {
    const stored = setSources({}, "cleaned_transcript", [
      buildEntry({
        sourceName: OPTIONAL.name,
        offered: OPTIONAL,
        deliver: "variable",
      }),
    ]);
    const seeded = seedAutoBinds({
      map: stored,
      targetNames: ["cleaned_transcript"],
      offeredByName: OFFERED,
      deliverFor: () => "variable",
    });
    expect(seeded.autoBound.size).toBe(0);
    expect(sourceNames(seeded.map, "cleaned_transcript")).toEqual([
      "session_title",
    ]);
  });

  it("seeds a context slot on the context channel", () => {
    const seeded = seedAutoBinds({
      map: {},
      targetNames: ["session_context"],
      offeredByName: OFFERED,
      deliverFor: () => "context",
    });
    expect(sourcesFor(seeded.map, "session_context")[0].deliver).toBe("context");
  });
});
