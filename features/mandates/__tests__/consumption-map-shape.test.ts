/**
 * THE FROZEN CONSUMPTION-MAP SHAPE (D18.2 / D18.3) — the client half of the
 * contract every mapping editor writes against.
 *
 * Arman, live-testing `mandate.goal_writer` on 2026-08-30: a job may offer
 * fifty values while the bound agent has two variables, so several offered
 * values must be able to land on ONE holder input, concatenated in mapping
 * order with a blank line between them. The pre-D18 shape held exactly one
 * source per target and could not express it.
 *
 * These hold the two halves that a rewrite could quietly break:
 *  · IN — the parser reads BOTH the list form and the pre-D18 bare object, and
 *    normalizes to a list so no consumer has to branch.
 *  · OUT — the wire encoder emits a bare object for one source and a list for
 *    several, so re-saving a binding written before 2026-08-31 rewrites it
 *    byte-identically instead of silently changing its stored shape.
 */

import {
  MULTI_SOURCE_JOINER,
  consumptionMapProblems,
  joinedTextOf,
  textFormOf,
  parseConsumptionMap,
  sourcesFor,
  type ConsumptionMap,
} from "@/features/mandates/provision-shapes";

const offer = {
  values: [
    { name: "task_overview", kind: "text", guaranteed: true, lazy: false, description: "" },
    { name: "inputs", kind: "text", guaranteed: true, lazy: false, description: "" },
    { name: "outputs", kind: "text", guaranteed: false, lazy: false, description: "" },
    { name: "roster", kind: "crm_contact", guaranteed: true, lazy: false, description: "" },
    { name: "cover", kind: "file", guaranteed: true, lazy: false, description: "" },
  ],
};

describe("the frozen shape — reading", () => {
  it("normalizes a pre-D18 bare object to a one-element list", () => {
    const map = parseConsumptionMap({
      topic: { mapType: "offered_value", target: "task_overview", deliver: "variable" },
    });
    expect(map.topic).toHaveLength(1);
    expect(map.topic[0]).toMatchObject({ target: "task_overview" });
    expect(map.topic[0].deliver).toBe("variable");
  });

  it("normalizes the shared binding writer's surface_value alias", () => {
    const map = parseConsumptionMap({
      transcript: {
        mapType: "surface_value",
        target: "transcript",
        required: true,
      },
    });
    expect(map.transcript).toEqual([
      {
        mapType: "offered_value",
        target: "transcript",
        deliver: "variable",
        required: true,
      },
    ]);
  });

  it("reads an ordered multi-source list and KEEPS the order", () => {
    const map = parseConsumptionMap({
      topic: [
        { mapType: "offered_value", target: "task_overview", deliver: "variable" },
        { mapType: "offered_value", target: "inputs", deliver: "variable" },
        { mapType: "offered_value", target: "outputs", deliver: "variable", when_absent: "skip" },
      ],
    });
    expect(
      map.topic.map((s) => (s.mapType === "offered_value" ? s.target : s.mapType)),
    ).toEqual([
      "task_overview",
      "inputs",
      "outputs",
    ]);
  });

  it("defaults a missing target to the map key, in every position", () => {
    const map = parseConsumptionMap({
      task_overview: [{ mapType: "offered_value", deliver: "variable" }],
    });
    expect(map.task_overview[0]).toMatchObject({ target: "task_overview" });
  });

  it("drops a target whose every source is junk — it feeds nothing", () => {
    // A `prompt_user` with NO QUESTION is junk (a blank box nobody can answer),
    // and 7 is not an entry at all. Neither survives, so the target does not.
    const map = parseConsumptionMap({ topic: [{ mapType: "prompt_user" }, 7] });
    expect(map.topic).toBeUndefined();
  });

  it("reads the two sources that landed with the server, 2026-08-31", () => {
    const map = parseConsumptionMap({
      report_tone: { mapType: "direct_value", target: "formal", deliver: "variable" },
      audience: {
        mapType: "prompt_user",
        prompt: "Who is this for?",
        required: true,
        deliver: "variable",
      },
    });
    expect(map.report_tone).toEqual([
      { mapType: "direct_value", target: "formal", deliver: "variable" },
    ]);
    expect(map.audience).toEqual([
      {
        mapType: "prompt_user",
        prompt: "Who is this for?",
        deliver: "variable",
        required: true,
      },
    ]);
  });

  it("drops a fixed value with nothing in it — it feeds nothing", () => {
    const map = parseConsumptionMap({
      report_tone: { mapType: "direct_value", target: null },
    });
    expect(map.report_tone).toBeUndefined();
  });

  it("sourcesFor answers [] for an unmapped target, never undefined", () => {
    expect(sourcesFor({} as ConsumptionMap, "nothing")).toEqual([]);
  });
});

describe("the frozen shape — validating", () => {
  const map = (raw: unknown) => parseConsumptionMap(raw);

  it("accepts several scalars feeding one input", () => {
    expect(
      consumptionMapProblems(
        offer,
        map({
          topic: [
            { mapType: "offered_value", target: "task_overview", deliver: "variable" },
            { mapType: "offered_value", target: "inputs", deliver: "variable" },
          ],
        }),
      ),
    ).toEqual([]);
  });

  // Arman, 2026-09-24: everything a model receives is text, and a structured
  // value's text form is its JSON. The old "it has no text form to join"
  // refusal was invented — a structured member joins as its JSON text.
  it("accepts a STRUCTURED value among several, on either channel — it joins as its JSON text", () => {
    for (const deliver of ["variable", "context"] as const) {
      expect(
        consumptionMapProblems(
          offer,
          map({
            topic: [
              { mapType: "offered_value", target: "task_overview", deliver },
              { mapType: "offered_value", target: "roster", deliver },
            ],
          }),
        ),
      ).toEqual([]);
    }
  });

  it("accepts a STRUCTURED fixed value on a variable and among several", () => {
    expect(
      consumptionMapProblems(
        offer,
        map({ topic: [{ mapType: "direct_value", target: { a: 1 }, deliver: "variable" }] }),
      ),
    ).toEqual([]);
    expect(
      consumptionMapProblems(
        offer,
        map({
          topic: [
            { mapType: "offered_value", target: "task_overview", deliver: "variable" },
            { mapType: "direct_value", target: [1, 2], deliver: "variable" },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("refuses a FILE among several — a media ref is a turn block, not text", () => {
    const problems = consumptionMapProblems(
      offer,
      map({
        topic: [
          { mapType: "offered_value", target: "task_overview", deliver: "variable" },
          { mapType: "offered_value", target: "cover", deliver: "variable" },
        ],
      }),
    );
    expect(problems.join(" ")).toContain("Cover");
  });

  it("allows a structured value ALONE on a context slot (D18.3)", () => {
    expect(
      consumptionMapProblems(
        offer,
        map({ workspace: [{ mapType: "offered_value", target: "roster", deliver: "context" }] }),
      ),
    ).toEqual([]);
  });

  it("refuses sources that disagree about where they land", () => {
    const problems = consumptionMapProblems(
      offer,
      map({
        topic: [
          { mapType: "offered_value", target: "task_overview", deliver: "variable" },
          { mapType: "offered_value", target: "inputs", deliver: "context" },
        ],
      }),
    );
    expect(problems.join(" ")).toContain("different places");
  });

  it("still demands an absence decision for an optional source, in any position", () => {
    const problems = consumptionMapProblems(
      offer,
      map({
        topic: [
          { mapType: "offered_value", target: "task_overview", deliver: "variable" },
          { mapType: "offered_value", target: "outputs", deliver: "variable" },
        ],
      }),
    );
    expect(problems.join(" ")).toContain("optional");
    expect(problems.join(" ")).toContain("Outputs");
  });
});

describe("the separator is the ruling, not a preference", () => {
  it("is a blank line, matching aidream MULTI_SOURCE_JOINER", () => {
    expect(MULTI_SOURCE_JOINER).toBe("\n\n");
  });
});

describe("the text form of a value on a prompt variable (mirror of aidream text_form_of)", () => {
  it("keeps a string as-is and renders a structured value as 2-space JSON", () => {
    expect(textFormOf("plain words")).toBe("plain words");
    expect(textFormOf({ name: "Zoë", tags: ["a"] })).toBe(
      '{\n  "name": "Zoë",\n  "tags": [\n    "a"\n  ]\n}',
    );
    expect(textFormOf(3)).toBe(3);
  });

  it("joins a structured member as its JSON text, blank-line separated, in order", () => {
    expect(joinedTextOf(["Overview", { a: 1 }, [1]])).toBe(
      'Overview\n\n{\n  "a": 1\n}\n\n[\n  1\n]',
    );
  });
});

// ── EVERY OFFERED KIND × EVERY CHANNEL ─────────────────────────────────────
//
// 2026-09-20, Arman on `/administration/mandates/feedback.item_triage_decision`:
// he mapped "Similar Open Items" (kind json, optional, lazy) onto a prompt
// variable with When missing = Skip and got "Mapping issue 1 — Invalid".
//
// Two separate defects, both fixed here at the class:
//   · The screen never said WHY (the sentence lived in a hover popover) — the
//     BindingMiddle half of that fix.
//   · The sentence, once read, ended "deliver it as context, never as a blob
//     variable" — an instruction nobody on that screen can carry out. The
//     delivery channel is DERIVED from whether the holder input is a prompt
//     variable or a context slot; there is no control to flip. A refusal whose
//     remedy cannot be performed is a dead end wearing a helpful sentence.
//
// 2026-09-24, Arman: the refusal itself was fake — everything a model receives
// is text, and a structured value's text form is its JSON. This matrix is now
// the guard that no kind is refused on either channel.
describe("every offered kind is accepted on both channels", () => {
  const ALL_KINDS = [
    "text",
    "string",
    "markdown",
    "number",
    "integer",
    "boolean",
    "string_list",
    "file",
    "file_list",
    "json",
    "crm_contact", // a registered content_ir kind — structured
  ] as const;
  const offerOf = (kind: string) => ({
    values: [
      { name: "value", kind, guaranteed: true, lazy: false, description: "" },
    ],
  });

  it.each(ALL_KINDS)("%s is judged the same way on both channels", (kind) => {
    const onVariable = consumptionMapProblems(offerOf(kind), {
      slot: [{ mapType: "offered_value", target: "value", deliver: "variable" }],
    });
    const onContext = consumptionMapProblems(offerOf(kind), {
      slot: [{ mapType: "offered_value", target: "value", deliver: "context" }],
    });
    // A context slot takes anything the platform can offer, and so does a
    // prompt variable: everything a model receives is text, and a structured
    // value's text form is its JSON (Arman, 2026-09-24).
    expect(onContext).toEqual([]);
    expect(onVariable).toEqual([]);
  });

  it("an optional value with Skip is NOT a mapping issue, whatever its kind", () => {
    // Arman's exact case: json + guaranteed:false + lazy + when_absent skip,
    // landing on a CONTEXT slot, is a complete and correct mapping.
    expect(
      consumptionMapProblems(
        {
          values: [
            {
              name: "similar_open_items",
              kind: "json",
              guaranteed: false,
              lazy: true,
              description: "",
            },
          ],
        },
        {
          similar_open_items: [
            {
              mapType: "offered_value",
              target: "similar_open_items",
              deliver: "context",
              when_absent: "skip",
            },
          ],
        },
      ),
    ).toEqual([]);
  });

  it("names the workflow, not 'the agent', when the holder is a workflow", () => {
    const [sentence] = consumptionMapProblems(
      offerOf("json"),
      { slot: [{ mapType: "offered_value", target: "missing", deliver: "variable" }] },
      { holderKind: "workflow" },
    );
    expect(sentence).toContain("the workflow's own default");
  });
});
