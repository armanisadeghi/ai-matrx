/**
 * The declared result contract, parsed (SPEC-workflow-ui-contract §2.4).
 *
 * `SERVED` below is the VERBATIM body of
 * `GET /workflows/3ffe233a-8ad6-43be-b1ee-42c232713bd4/result-schema`
 * against the local HEAD server on 2026-08-28 — not a hand-written guess at
 * what the endpoint might return.
 */

import {
  panelDeliverables,
  parseResultSchema,
  showcaseDeliverables,
} from "../result-schema";

const SERVED = {
  definition_id: "3ffe233a-8ad6-43be-b1ee-42c232713bd4",
  version: 1,
  input_kind: null,
  output_kind: null,
  input_kind_declared: false,
  output_kind_declared: false,
  declaration_error: null,
  deliverables: [
    {
      node_id: "emit_quiz",
      title: "A quiz for you",
      output_kind: null,
      json_schema: { type: "object", title: "ToFrontendOutput" },
      presentation: "panel",
      is_primary: false,
    },
    {
      node_id: "emit_note",
      title: "A kindless note",
      output_kind: null,
      json_schema: { type: "object", title: "ToFrontendOutput" },
      presentation: "panel",
      is_primary: false,
    },
    {
      node_id: "emit_deck1",
      title: "First reveal",
      output_kind: null,
      json_schema: {},
      presentation: "showcase",
      is_primary: false,
    },
    {
      node_id: "emit_deck2",
      title: "Second reveal",
      output_kind: null,
      json_schema: {},
      presentation: "showcase",
      is_primary: false,
    },
  ],
};

describe("parseResultSchema — the served promise", () => {
  it("reads the fixture the server actually serves", () => {
    const schema = parseResultSchema(SERVED);
    expect(schema.definitionId).toBe("3ffe233a-8ad6-43be-b1ee-42c232713bd4");
    expect(schema.version).toBe(1);
    expect(schema.deliverables).toHaveLength(4);
    expect(schema.outputKindDeclared).toBe(false);
    expect(schema.declarationError).toBeNull();
  });

  it("carries each node's AUTHORED presentation through untouched", () => {
    const schema = parseResultSchema(SERVED);
    expect(showcaseDeliverables(schema).map((d) => d.nodeId)).toEqual([
      "emit_deck1",
      "emit_deck2",
    ]);
    expect(panelDeliverables(schema).map((d) => d.nodeId)).toEqual([
      "emit_quiz",
      "emit_note",
    ]);
  });

  it("keeps a null output_kind as null — never coerced to a slug", () => {
    // The null IS the contract fact the dedupe has to cope with; inventing a
    // kind here would hide the gap instead of handling it.
    for (const d of parseResultSchema(SERVED).deliverables) {
      expect(d.outputKind).toBeNull();
    }
  });

  it("narrows an unknown presentation to panel — never displaces", () => {
    const schema = parseResultSchema({
      deliverables: [{ node_id: "n1", presentation: "hero" }],
    });
    expect(schema.deliverables[0].presentation).toBe("panel");
    expect(schema.deliverables[0].title).toBe("n1"); // falls back to the id
  });

  it("drops a deliverable with no node id — it is not addressable", () => {
    const schema = parseResultSchema({
      deliverables: [{ title: "orphan" }, { node_id: "n1", title: "real" }],
    });
    expect(schema.deliverables.map((d) => d.nodeId)).toEqual(["n1"]);
  });

  it("is total: a malformed body yields an empty promise, never a throw", () => {
    for (const bad of [null, undefined, 42, "nope", [], {}]) {
      expect(parseResultSchema(bad).deliverables).toEqual([]);
    }
  });

  it("surfaces a declaration_error rather than swallowing it", () => {
    const schema = parseResultSchema({
      ...SERVED,
      declaration_error: "declared output_kind 'report' is not a deliverable",
    });
    expect(schema.declarationError).toContain("report");
  });
});
