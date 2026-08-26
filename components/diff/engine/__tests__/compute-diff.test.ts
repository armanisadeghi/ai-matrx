/**
 * computeDiff — the shared structured-diff engine.
 *
 * These tests exist because of a crash class, not a feature: `diffArrays`
 * decides "array of objects" from the FIRST element only, then
 * `diffArrayOfObjects` used to recurse into every matched pair unconditionally.
 * A heterogeneous array — `[{...}, "str"]`, `[{...}, null]`, an array of arrays
 * — therefore ran `key in "str"` / `Object.keys(null)` and **threw a raw
 * TypeError**.
 *
 * That matters more than a bad diff: this engine runs DURING RENDER inside
 * `AgentDiffViewer` and `NoteDiffViewer`, where nothing catches it. Every
 * container it diffs (`messages`, `settings`, `custom_tools`, note content) is
 * unconstrained `jsonb` — nothing in the schema forbids the shape.
 */

import { computeDiff } from "../compute-diff";

const OBJ = { x: 1 };

describe("computeDiff — heterogeneous arrays never throw", () => {
  const cases: [string, unknown[], unknown[]][] = [
    ["object then string", [OBJ, "a"], [OBJ, "b"]],
    ["object then null", [OBJ, "a"], [OBJ, null]],
    ["object then number", [OBJ, 1], [OBJ, 2]],
    ["object then array", [OBJ, [1]], [OBJ, [2]]],
    ["array of arrays", [[1], [2]], [[1], [3]]],
    ["string first, object second", ["a", OBJ], ["a", { x: 2 }]],
    ["object vs primitive at the same index", [OBJ], ["a"]],
    ["primitive vs object at the same index", ["a"], [OBJ]],
  ];

  it.each(cases)("%s", (_label, before, after) => {
    expect(() => computeDiff({ items: before }, { items: after })).not.toThrow();
    const result = computeDiff({ items: before }, { items: after });
    expect(result.hasChanges).toBe(true);
  });

  it("still reports no change when a heterogeneous array is unchanged", () => {
    const arr = [OBJ, "a", null, [1]];
    const result = computeDiff({ items: arr }, { items: [...arr] });
    expect(result.hasChanges).toBe(false);
  });

  it("survives a heterogeneous array nested arbitrarily deep", () => {
    expect(() =>
      computeDiff(
        { a: { b: { c: [{ x: 1 }, "left"] } } },
        { a: { b: { c: [{ x: 1 }, "right"] } } },
      ),
    ).not.toThrow();
  });

  it("still recurses into genuinely matched object pairs", () => {
    // The guard must not flatten the normal case into an opaque leaf.
    const result = computeDiff(
      { items: [{ id: "a", label: "one" }] },
      { items: [{ id: "a", label: "two" }] },
    );
    const node = result.root.find((n) => n.key === "items");
    expect(node?.changeType).toBe("modified");
    expect(node?.children?.[0]?.children?.some((c) => c.key === "label")).toBe(
      true,
    );
  });
});

describe("computeDiff — array-of-primitives reorder detection", () => {
  it("reports a pure reorder as reordered", () => {
    const result = computeDiff({ t: ["a", "b"] }, { t: ["b", "a"] });
    expect(result.root[0]?.children?.[0]?.changeType).toBe("reordered");
  });

  it("reports a same-length multiplicity change as reordered too", () => {
    // Documents the engine's SET-based behavior. Consumers that need to know
    // whether this is REALLY just an order change must compare multisets —
    // see isOrderOnly in features/agents/sync/compare.ts.
    const result = computeDiff({ t: ["a", "a", "b"] }, { t: ["a", "b", "b"] });
    expect(result.root[0]?.children?.[0]?.changeType).toBe("reordered");
    expect(result.hasChanges).toBe(true);
  });
});

describe("computeDiff — underscore-prefixed contract keys", () => {
  const before = {
    outputSchema: {
      type: "object",
      properties: { title: { type: "string" } },
    },
  };
  const after = {
    outputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        __kind: { type: "string" },
      },
    },
  };

  it("reports nested __kind changes by default", () => {
    const result = computeDiff(before, after);

    expect(result.hasChanges).toBe(true);
    expect(result.root[0]?.changeType).toBe("modified");
    expect(
      result.root[0]?.children?.[1]?.children?.some(
        (node) => node.key === "__kind" && node.changeType === "added",
      ),
    ).toBe(true);
  });

  it("still supports an explicit metadata-only underscore filter", () => {
    const result = computeDiff(before, after, { skipUnderscorePrefix: true });

    expect(result.hasChanges).toBe(false);
  });
});

describe("computeDiff — exclusions are path-scoped", () => {
  it("applies a bare exclusion only to the root field", () => {
    const result = computeDiff(
      { id: "record-a", settings: { id: "provider-a" } },
      { id: "record-b", settings: { id: "provider-b" } },
      { excludePaths: new Set(["id"]) },
    );

    expect(result.root.map((node) => node.key)).toEqual(["settings"]);
    expect(result.hasChanges).toBe(true);
  });

  it("supports an explicit dotted nested exclusion", () => {
    const result = computeDiff(
      { settings: { id: "provider-a" } },
      { settings: { id: "provider-b" } },
      { excludePaths: new Set(["settings.id"]) },
    );

    expect(result.hasChanges).toBe(false);
  });
});

describe("computeDiff — order-sensitive object paths", () => {
  it("reports a nested authored-key reorder under a configured path", () => {
    const result = computeDiff(
      {
        outputSchema: {
          type: "object",
          properties: { title: { type: "string" }, score: { type: "number" } },
        },
      },
      {
        outputSchema: {
          type: "object",
          properties: { score: { type: "number" }, title: { type: "string" } },
        },
      },
      { orderSensitiveObjectPaths: new Set(["outputSchema"]) },
    );

    expect(result.hasChanges).toBe(true);
    expect(result.root[0]?.changeType).toBe("modified");
  });

  it("continues to ignore object-key order outside configured paths", () => {
    const result = computeDiff(
      { settings: { alpha: 1, beta: 2 } },
      { settings: { beta: 2, alpha: 1 } },
    );

    expect(result.hasChanges).toBe(false);
  });
});

describe("computeDiff — identity-keyed arrays are lossless", () => {
  const options = { identityKeys: { items: "name" } };

  it("reports a pure reorder of identity-matched objects", () => {
    const result = computeDiff(
      { items: [{ name: "a" }, { name: "b" }] },
      { items: [{ name: "b" }, { name: "a" }] },
      options,
    );

    expect(result.hasChanges).toBe(true);
    expect(result.root[0]?.children?.every((node) => node.changeType === "reordered")).toBe(true);
  });

  it("does not collapse changed items when configured identities collide", () => {
    const result = computeDiff(
      { items: [{ name: "same", value: 1 }, { name: "same", value: 2 }] },
      { items: [{ name: "same", value: 1 }, { name: "same", value: 3 }] },
      options,
    );

    expect(result.hasChanges).toBe(true);
    expect(result.root[0]?.children).toHaveLength(2);
    expect(result.root[0]?.children?.[1]?.changeType).toBe("modified");
  });
});
