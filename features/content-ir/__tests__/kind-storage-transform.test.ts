/**
 * Round-trip proof for the content_ir storage transform: the adapter read
 * direction is the EXACT inverse of the migration write direction, for every
 * FieldSchema variant — including the two ref carriers and a ref nested inside
 * an inline_object (the path-collision case the dot-path edges exist to solve).
 */

import type { KindSchema } from "../core/kind-schema.types";
import {
  kindSchemaToStorage,
  storageToKindSchema,
  type KindEdgeSpec,
} from "../registry/kind-storage-transform";

function roundTrip(schema: KindSchema): KindSchema {
  return storageToKindSchema(schema.kind, kindSchemaToStorage(schema));
}

describe("kind storage transform — round trip", () => {
  it("preserves every scalar / array / record / enum / union field", () => {
    const schema: KindSchema = {
      kind: "scalars_kind",
      fields: {
        title: { type: "string", required: true },
        count: { type: "number" },
        active: { type: "boolean", nullable: true },
        tags: { type: "string[]", nullable: true },
        scores: { type: "number[]" },
        flags: { type: "boolean[]" },
        lookup: { type: "record", values: "string" },
        level: { type: "enum", values: ["easy", "hard"], required: true },
        mixed: { type: "union", scalars: ["string", "number"] },
      },
    };
    expect(roundTrip(schema)).toEqual(schema);
  });

  it("externalizes a single object ref to exactly one edge (no position)", () => {
    const schema: KindSchema = {
      kind: "has_author",
      fields: {
        title: { type: "string", required: true },
        author: { type: "object", kind: "person", required: true },
      },
    };
    const { edges } = kindSchemaToStorage(schema);
    expect(edges).toEqual<KindEdgeSpec[]>([
      { fieldPath: "author", childKind: "person", position: null },
    ]);
    expect(roundTrip(schema)).toEqual(schema);
  });

  it("externalizes an array (union) ref to ordered edges and restores itemKinds order", () => {
    const schema: KindSchema = {
      kind: "deck",
      fields: {
        slides: {
          type: "array",
          itemKinds: ["title_slide", "content_slide", "image_slide"],
          required: true,
        },
      },
    };
    const { data, edges } = kindSchemaToStorage(schema);
    // data element carries NO target
    expect(data).toEqual([{ name: "slides", type: "array", required: true }]);
    expect(edges).toEqual<KindEdgeSpec[]>([
      { fieldPath: "slides", childKind: "title_slide", position: 0 },
      { fieldPath: "slides", childKind: "content_slide", position: 1 },
      { fieldPath: "slides", childKind: "image_slide", position: 2 },
    ]);
    expect(roundTrip(schema)).toEqual(schema);
  });

  it("gives a ref nested inside an inline_object a distinct dot-path edge (collision-free)", () => {
    const schema: KindSchema = {
      kind: "problem",
      fields: {
        // top-level `author` AND meta.author — same field name, different paths.
        author: { type: "object", kind: "person" },
        meta: {
          type: "inline_object",
          required: true,
          fields: {
            text: { type: "string", required: true },
            author: { type: "object", kind: "editor" },
            reviewers: { type: "array", itemKinds: ["editor"] },
          },
        },
      },
    };
    const { edges } = kindSchemaToStorage(schema);
    expect(edges).toEqual<KindEdgeSpec[]>([
      { fieldPath: "author", childKind: "person", position: null },
      { fieldPath: "meta.author", childKind: "editor", position: null },
      { fieldPath: "meta.reviewers", childKind: "editor", position: 0 },
    ]);
    // The two `author` edges do NOT collide, so the inverse rebuilds both refs.
    expect(roundTrip(schema)).toEqual(schema);
  });

  it("preserves field ORDER through the array (the jsonb key-reorder fix)", () => {
    const schema: KindSchema = {
      kind: "ordered",
      fields: {
        zebra: { type: "string" },
        alpha: { type: "string" },
        middle: { type: "string" },
      },
    };
    const { data } = kindSchemaToStorage(schema);
    expect(data.map((d) => d.name)).toEqual(["zebra", "alpha", "middle"]);
    // Inverse preserves it too (insertion order into the fields Record).
    expect(Object.keys(roundTrip(schema).fields)).toEqual([
      "zebra",
      "alpha",
      "middle",
    ]);
  });

  it("models flashcard_set (self-referential array child) round-trip", () => {
    const schema: KindSchema = {
      kind: "flashcard_set",
      fields: {
        title: { type: "string", required: true },
        cards: { type: "array", itemKinds: ["flashcard"], required: true },
      },
    };
    expect(roundTrip(schema)).toEqual(schema);
  });
});

describe("kind storage transform — 2026-07-15 expressivity constructs", () => {
  it("round-trips json / json[] / record-of-json / open inline_object fields", () => {
    const schema: KindSchema = {
      kind: "any_carrier",
      fields: {
        body: { type: "json" },
        matches: { type: "json[]", required: true },
        last_outputs: { type: "record", values: "json" },
        meta: {
          type: "inline_object",
          open: true,
          fields: { note: { type: "string" } },
        },
        empty_open: { type: "inline_object", open: true, fields: {} },
        closed: { type: "inline_object", fields: {} },
      },
    };
    const shape = kindSchemaToStorage(schema);
    expect(shape.edges).toEqual([]);
    expect(roundTrip(schema)).toEqual(schema);
    // The open flag survives storage — losing it is the open-empty-object defect.
    const restored = roundTrip(schema);
    expect(restored.fields.empty_open).toEqual({
      type: "inline_object",
      open: true,
      fields: {},
    });
    expect(restored.fields.closed).toEqual({ type: "inline_object", fields: {} });
  });

  it("externalizes union kind members to positioned edges and round-trips them", () => {
    const schema: KindSchema = {
      kind: "union_carrier",
      fields: {
        payload: {
          type: "union",
          required: true,
          scalars: ["string"],
          kinds: ["alpha_kind", "beta_kind"],
        },
        scalar_only: { type: "union", scalars: ["number", "boolean"] },
      },
    };
    const { data, edges } = kindSchemaToStorage(schema);
    expect(edges).toEqual<KindEdgeSpec[]>([
      { fieldPath: "payload", childKind: "alpha_kind", position: 0 },
      { fieldPath: "payload", childKind: "beta_kind", position: 1 },
    ]);
    const stored = data.find((d) => d.name === "payload");
    expect(stored).toMatchObject({ type: "union", hasKinds: true });
    expect(roundTrip(schema)).toEqual(schema);
  });

  it("screams when a union's declared kind edges are missing (never a silent narrowing)", () => {
    expect(() =>
      storageToKindSchema("broken", {
        data: [
          { name: "payload", type: "union", scalars: ["string"], hasKinds: true },
        ],
        edges: [],
      }),
    ).toThrow(/declares kind members .* no edges/);
  });

  it("stores a non-object ROOT form as the single reserved __root element", () => {
    const roots: KindSchema[] = [
      { kind: "text", fields: {}, root: { type: "string" } },
      { kind: "json", fields: {}, root: { type: "json" } },
      { kind: "string_list", fields: {}, root: { type: "string[]" } },
      {
        kind: "branch_result",
        fields: {},
        root: {
          type: "inline_object",
          open: true,
          fields: {
            value: { type: "json" },
            direction: { type: "string", required: true },
          },
        },
      },
    ];
    for (const schema of roots) {
      const shape = kindSchemaToStorage(schema);
      expect(shape.data).toHaveLength(1);
      expect(shape.data[0]?.name).toBe("__root");
      expect(roundTrip(schema)).toEqual(schema);
    }
  });

  it("round-trips a root form whose root carries kind refs (edges under __root)", () => {
    const schema: KindSchema = {
      kind: "wrapper",
      fields: {},
      root: { type: "array", itemKinds: ["alpha_kind", "beta_kind"] },
    };
    const { edges } = kindSchemaToStorage(schema);
    expect(edges).toEqual<KindEdgeSpec[]>([
      { fieldPath: "__root", childKind: "alpha_kind", position: 0 },
      { fieldPath: "__root", childKind: "beta_kind", position: 1 },
    ]);
    expect(roundTrip(schema)).toEqual(schema);
  });

  it("rejects the reserved __root name as a REAL field, and root+fields together", () => {
    expect(() =>
      kindSchemaToStorage({
        kind: "bad",
        fields: { __root: { type: "string" } },
      }),
    ).toThrow(/reserved/);
    expect(() =>
      kindSchemaToStorage({
        kind: "bad2",
        fields: { title: { type: "string" } },
        root: { type: "string" },
      }),
    ).toThrow(/mutually exclusive/);
  });
});

describe("kind storage transform — input-semantics constructs (W3-A)", () => {
  it("round-trips description / default / bounds / open enum / items-enum", () => {
    const schema: KindSchema = {
      kind: "input_semantics_demo",
      fields: {
        audience: {
          type: "enum",
          values: ["kids", "adults"],
          open: true,
          description: "Who reads this",
          default: "adults",
          required: true,
        },
        count: { type: "number", min: 1, max: 100, step: 1, default: 10 },
        topics: { type: "string[]", values: ["a", "b"], open: true },
        tags: { type: "string[]", values: ["x"] },
        plain: { type: "string[]" },
        note: { type: "string", description: "Free text", default: "hi" },
        payload: { type: "json", default: null },
      },
    };
    const stored = kindSchemaToStorage(schema);
    expect(stored.edges).toEqual([]);
    expect(storageToKindSchema(schema.kind, stored)).toEqual(schema);
    // `null` default survives storage (only ABSENCE is absence).
    const payload = stored.data.find((e) => e.name === "payload");
    expect(payload && "default" in payload && payload.default).toBeNull();
  });
});
