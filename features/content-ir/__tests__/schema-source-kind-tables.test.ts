/**
 * The content_ir read adapter's pure core: kind_definition rows + kind_edge
 * rows reconstruct the exact KindSchema, resolving each edge's
 * child_definition_id back to the child's kind slug.
 */

import {
  reconstructKindRegistry,
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

  // FOUND_DEFECTS D156: a python-owned kind whose schema is too nested for
  // aidream's `fields_from_json_schema` stores a NULL `data[]` but a COMPLETE
  // `emitted_json_schema`. The adapter must carry that column through verbatim
  // — reading only `data` made 140 active kinds look contract-less.
  it("carries an unflattened object contract but omits its unavailable parser schema", () => {
    const nested = {
      type: "object",
      required: ["ideas"],
      properties: {
        ideas: {
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" } },
          },
        },
      },
    };
    const defs: KindDefProjection[] = [
      {
        id: "d-py",
        kind: "topic_ideas",
        label: "Topic Ideas",
        data: null,
        emitted_json_schema: nested,
      },
      {
        id: "d-none",
        kind: "no_schema",
        label: "No Schema",
        data: null,
      },
    ];
    const { schemas, entries } = reconstructKindRegistry(defs, []);
    const py = entries.find((e) => e.slug === "topic_ideas");
    expect(py).toBeDefined();
    // The catalog still carries the authoritative contract verbatim.
    expect(py!.fields).toEqual({});
    expect(py!.emittedJsonSchema).toEqual(nested);
    // No nesting is flattened on the way through.
    expect(JSON.stringify(py!.emittedJsonSchema)).toBe(JSON.stringify(nested));
    // But NULL `data` cannot faithfully teach the streaming parser this object
    // shape. Omission preserves any compiled floor instead of inventing an
    // empty object schema that would turn every payload field into residue.
    expect(schemas.topic_ideas).toBeUndefined();
    // An absent column reads as null, never undefined-by-omission.
    expect(
      entries.find((e) => e.slug === "no_schema")!.emittedJsonSchema,
    ).toBeNull();
    expect(schemas.no_schema).toEqual({ kind: "no_schema", fields: {} });
  });

  it("also recognizes nullable object schemas as unflattened contracts", () => {
    const { schemas } = reconstructKindRegistry(
      [
        {
          id: "nullable-object",
          kind: "nullable_object",
          label: "Nullable Object",
          data: null,
          emitted_json_schema: {
            type: ["object", "null"],
            properties: { title: { type: "string" } },
          },
        },
      ],
      [],
    );

    expect(schemas.nullable_object).toBeUndefined();
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

  it("reconstructs a scalar kind (null data) as an empty field map, not malformed", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const defs: KindDefProjection[] = [
      // Scalar/passthrough kinds (text, number, json, …) have NO named fields,
      // so their stored `data` is SQL null — a valid empty field map.
      { id: "t", kind: "text", label: "Text", data: null },
      { id: "n", kind: "number", label: "Number", data: null },
    ];
    const { schemas } = reconstructKindRegistry(defs, []);
    expect(schemas.text).toEqual({ kind: "text", fields: {} });
    expect(schemas.number).toEqual({ kind: "number", fields: {} });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("skips (loudly) a kind whose data is malformed, keeping the rest", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const defs: KindDefProjection[] = [
      { id: "x", kind: "bad", label: "Bad", data: { not: "an array" } },
      {
        id: "y",
        kind: "good",
        label: "Good",
        data: [{ name: "t", type: "string" }],
      },
    ];
    const { schemas } = reconstructKindRegistry(defs, []);
    expect(schemas.good).toBeDefined();
    expect(schemas.bad).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('skipped malformed kind "bad"'),
    );
    warn.mockRestore();
  });

  it("skips a malformed kind (dangling ref) loudly instead of crashing the batch", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const defs: KindDefProjection[] = [
      // Good kind — must survive.
      {
        id: "ok",
        kind: "healthy",
        label: "Healthy",
        data: [{ name: "title", type: "string" }],
      },
      // Broken: object ref whose child edge is missing → storageToKindSchema throws.
      {
        id: "p",
        kind: "broken",
        label: "Broken",
        data: [{ name: "child", type: "object" }],
      },
    ];
    const edges: KindEdgeProjection[] = [
      {
        parent_definition_id: "p",
        field_name: "child",
        child_definition_id: "gone", // no matching def → edge dropped → no edge for the ref field
        position: null,
      },
    ];
    const { schemas } = reconstructKindRegistry(defs, edges);
    // The good kind survives; the broken one is skipped, not fatal.
    expect(schemas.healthy).toBeDefined();
    expect(schemas.broken).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('skipped malformed kind "broken"'),
    );
    warn.mockRestore();
  });
});

describe("content_ir read adapter — cold tier", () => {
  afterEach(() => {
    jest.dontMock("@/utils/supabase/client");
    jest.resetModules();
  });

  it("returns schema unavailable for a NULL-data object contract", async () => {
    jest.resetModules();

    const query = (result: unknown) => {
      const builder: Record<string, jest.Mock | unknown> = {};
      for (const method of ["select", "eq", "is", "order", "limit", "in"]) {
        builder[method] = jest.fn(() => builder);
      }
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(resolve, reject);
      return builder;
    };

    const definitionQuery = query({
      data: [
        {
          id: "py-object",
          kind: "py_object",
          label: "Python Object",
          data: null,
          metadata: { loading_component: "card" },
          emitted_json_schema: {
            type: "object",
            properties: { nested: { type: "object" } },
          },
        },
      ],
      error: null,
    });
    const edgeQuery = query({ data: [], error: null });
    const from = jest.fn((table: string) =>
      table === "kind_definition" ? definitionQuery : edgeQuery,
    );
    jest.doMock("@/utils/supabase/client", () => ({
      supabase: { schema: jest.fn(() => ({ from })) },
    }));

    const { getKindSchemaAndMetaBySlugFromTables } =
      await import("../registry/schema-source-kind-tables");
    const result = await getKindSchemaAndMetaBySlugFromTables("py_object");

    expect(result).toEqual({ schema: null, loadingComponent: "card" });
  });
});
