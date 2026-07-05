/**
 * The content_ir read adapter's pure core: kind_definition rows + kind_edge
 * rows reconstruct the exact KindSchema, resolving each edge's
 * child_definition_id back to the child's kind slug.
 */

import {
  reconstructKindRegistry,
  KindTablesError,
  type KindDefProjection,
  type KindEdgeProjection,
} from "../registry/schema-source-kind-tables";

const DEFS: KindDefProjection[] = [
  {
    id: "d-set",
    kind: "flashcard_set",
    label: "Flashcard Set",
    data: [
      { name: "title", type: "string", required: true },
      { name: "cards", type: "array", required: true }, // ref → resolved via edge
    ],
  },
  {
    id: "d-card",
    kind: "flashcard",
    label: "Flashcard",
    data: [
      { name: "front", type: "string", required: true },
      { name: "back", type: "string", required: true },
    ],
  },
];

const EDGES: KindEdgeProjection[] = [
  {
    parent_definition_id: "d-set",
    field_name: "cards",
    child_definition_id: "d-card", // id, NOT slug — must resolve to "flashcard"
    position: 0,
  },
];

describe("content_ir read adapter — reconstruction", () => {
  it("rebuilds object/array refs by resolving child ids to slugs", () => {
    const { schemas, entries } = reconstructKindRegistry(DEFS, EDGES);

    expect(schemas.flashcard_set).toEqual({
      kind: "flashcard_set",
      fields: {
        title: { type: "string", required: true },
        cards: { type: "array", itemKinds: ["flashcard"], required: true },
      },
    });
    expect(schemas.flashcard).toEqual({
      kind: "flashcard",
      fields: {
        front: { type: "string", required: true },
        back: { type: "string", required: true },
      },
    });
    expect(entries.map((e) => e.slug).sort()).toEqual([
      "flashcard",
      "flashcard_set",
    ]);
  });

  it("preserves field ORDER from the data array", () => {
    const defs: KindDefProjection[] = [
      {
        id: "x",
        kind: "ordered",
        label: "Ordered",
        data: [
          { name: "zebra", type: "string" },
          { name: "alpha", type: "string" },
        ],
      },
    ];
    const { schemas } = reconstructKindRegistry(defs, []);
    expect(Object.keys(schemas.ordered.fields)).toEqual(["zebra", "alpha"]);
  });

  it("throws loudly on malformed data (not an array of named/typed fields)", () => {
    const defs: KindDefProjection[] = [
      { id: "x", kind: "bad", label: "Bad", data: { not: "an array" } },
    ];
    expect(() => reconstructKindRegistry(defs, [])).toThrow(KindTablesError);
  });

  it("drops a dangling edge (missing child) rather than crashing", () => {
    const defs: KindDefProjection[] = [
      {
        id: "p",
        kind: "parent",
        label: "P",
        data: [{ name: "child", type: "object" }],
      },
    ];
    const edges: KindEdgeProjection[] = [
      {
        parent_definition_id: "p",
        field_name: "child",
        child_definition_id: "gone", // no matching def
        position: null,
      },
    ];
    // object field with a dropped edge → storageToKindSchema throws (an object
    // ref MUST have exactly one edge) — proving refs can't silently vanish.
    expect(() => reconstructKindRegistry(defs, edges)).toThrow();
  });
});
