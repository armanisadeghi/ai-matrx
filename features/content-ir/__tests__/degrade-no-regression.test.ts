/**
 * THE NO-REGRESSION LAW — a degrade never blanks already-published data.
 *
 * The bug (2026-07-28, keyword research): the root object closed without
 * satisfying its schema, the parser emitted `raw_object` at the root with a
 * poorer value, and `IrTree.markRaw` deleted the root node and adopted that
 * value wholesale. `buildEnvelope` then handed consumers `root.value = {}`,
 * every downstream reader reconstructed a valid-but-EMPTY payload, and a
 * fully-rendered block vanished mid-stream. `complete` could not repair it
 * either — it only filled a root raw value that was still `null`.
 *
 * These pin the fix at the tree seam: incoming keys win, prior keys survive,
 * and the rescue is reported on the envelope (never silently absorbed).
 */

import { IrTree } from "../core/ir-tree";

const RESEARCH_VALUE = {
  __kind: "keyword_relationship_research",
  primary_keyword: "espresso machines",
  keyword_lists: [
    { label: "Comparisons", keywords: ["best espresso machine"] },
  ],
};

function treeWithPublishedRoot(): IrTree {
  const tree = new IrTree();
  tree.applyEvent({
    type: "block_snapshot",
    kind: "keyword_relationship_research",
    path: [],
    value: RESEARCH_VALUE,
    residue: null,
    complete: false,
    at: 0,
  });
  return tree;
}

describe("degrade never regresses published data", () => {
  it("an EMPTY root raw_object cannot blank a rendered root", () => {
    const tree = treeWithPublishedRoot();

    tree.applyEvent({
      type: "raw_object",
      path: [],
      value: {},
      reason: "no schema registered",
      at: 1,
    });

    const envelope = tree.buildEnvelope("fp");
    expect(envelope.root.value).toMatchObject(RESEARCH_VALUE);
    expect(envelope.root.kindState).toBe("raw");
    expect(
      envelope.root.residue?.notices?.some(
        (n) => n.code === "degrade_data_rescued",
      ),
    ).toBe(true);
  });

  it("a PARTIAL root raw_object keeps its own keys and rescues the rest", () => {
    const tree = treeWithPublishedRoot();

    tree.applyEvent({
      type: "raw_object",
      path: [],
      value: { primary_keyword: "espresso machines (revised)" },
      reason: "schema violation",
      at: 1,
    });

    const value = tree.buildEnvelope("fp").root.value;
    expect(value.primary_keyword).toBe("espresso machines (revised)");
    expect(value.keyword_lists).toEqual(RESEARCH_VALUE.keyword_lists);
  });

  it("completion repairs a root a mid-stream degrade already emptied", () => {
    const tree = treeWithPublishedRoot();
    tree.applyEvent({
      type: "raw_object",
      path: [],
      value: {},
      reason: "no schema registered",
      at: 1,
    });

    tree.applyEvent({
      type: "complete",
      kind: "keyword_relationship_research",
      value: RESEARCH_VALUE,
      at: 2,
    });

    const envelope = tree.buildEnvelope("fp");
    expect(envelope.root.status).toBe("complete");
    expect(envelope.root.value).toMatchObject(RESEARCH_VALUE);
  });

  it("a child degrade does not blank the child's slot in its parent", () => {
    const tree = new IrTree();
    tree.applyEvent({
      type: "block_snapshot",
      kind: "parent_kind",
      path: [],
      value: {
        __kind: "parent_kind",
        items: [{ __kind: "child_kind", label: "one" }],
      },
      residue: null,
      complete: false,
      at: 0,
    });
    tree.applyEvent({
      type: "block_snapshot",
      kind: "child_kind",
      path: ["items", 0],
      value: { __kind: "child_kind", label: "one", detail: "kept" },
      residue: null,
      complete: true,
      at: 1,
    });

    tree.applyEvent({
      type: "raw_object",
      path: ["items", 0],
      value: {},
      reason: "no schema registered",
      at: 2,
    });

    const items = tree.buildEnvelope("fp").root.value.items as Array<
      Record<string, unknown>
    >;
    expect(items[0]).toMatchObject({ label: "one", detail: "kept" });
  });

  it("a normal degrade with no prior data reports nothing and passes its value through", () => {
    const tree = new IrTree();

    tree.applyEvent({
      type: "raw_object",
      path: [],
      value: { a: 1 },
      reason: "missing __kind",
      at: 0,
    });

    const envelope = tree.buildEnvelope("fp");
    expect(envelope.root.value).toEqual({ a: 1 });
    expect(
      envelope.root.residue?.notices?.some(
        (n) => n.code === "degrade_data_rescued",
      ),
    ).toBe(false);
  });
});
