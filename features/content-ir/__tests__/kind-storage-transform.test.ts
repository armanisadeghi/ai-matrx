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
