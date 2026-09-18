// features/marketing/seo/topical-map/proposals/topicRows.test.ts
//
// The ONE flattener behind the chat proposal renderer and the tool-result
// renderer (R11). Watched failing first: (1) with the parent-lookup removed
// the out-of-order `metals-copper` became a root; (2) with `hiddenBelowDepth`
// removed a collapsed branch still listed its children; (3) with `?? 0` on
// the counts a proposal (which never has counts) printed zeros.

import { RECORDED_FACTORY_PLAYGROUND_TREE } from "./__fixtures__/factoryPlaygroundRecorded";
import { DOCUMENTED_MAP_TREE, DOCUMENTED_PROPOSAL } from "./__fixtures__/mapTopicProposalDocumented";
import {
  expandableSlugs,
  flattenProposalNodes,
  flattenTreeNodes,
  orphanedProposalNodes,
  topicPathNames,
  topicTreeRows,
} from "./topicRows";

describe("flattenProposalNodes", () => {
  it("rebuilds tree order from parent_slug even when a child is listed before its parent", () => {
    const flat = flattenProposalNodes(DOCUMENTED_PROPOSAL.topics);
    expect(flat.map((t) => `${t.depth}:${t.slug}`)).toEqual([
      "0:recycling",
      "1:metals",
      "2:metals-copper",
      "2:metals-aluminum",
      "1:e-waste",
    ]);
    expect(flat.find((t) => t.slug === "metals")?.hasChildren).toBe(true);
    expect(flat.find((t) => t.slug === "e-waste")?.hasChildren).toBe(false);
  });

  it("keeps a node whose parent is not in the list, as a root (never dropped)", () => {
    const flat = flattenProposalNodes([
      { __kind: "map_topic_node_v1", slug: "orphan", name: "Orphan", status: "proposed", parent_slug: "missing" },
    ]);
    expect(flat).toHaveLength(1);
    expect(flat[0].depth).toBe(0);
    expect(flat[0].parentSlug).toBeNull();
  });

  it("carries NO counts for a proposal — absent is not zero", () => {
    for (const topic of flattenProposalNodes(DOCUMENTED_PROPOSAL.topics)) {
      expect(topic.counts).toBeUndefined();
    }
  });
});

describe("flattenTreeNodes", () => {
  it("unrolls a seo.map_tree payload into the same order and carries its counts", () => {
    const flat = flattenTreeNodes(DOCUMENTED_MAP_TREE.topics);
    expect(flat.map((t) => `${t.depth}:${t.slug}`)).toEqual([
      "0:recycling",
      "1:metals",
      "2:metals-copper",
      "2:metals-aluminum",
      "1:e-waste",
    ]);
    expect(flat[0].counts).toEqual({ pages: 4, planned: 0, keywords: 12 });
  });

  it("unrolls Factory Playground's RECORDED 52-topic tree, every topic proposed, counts carried as zeros", () => {
    const flat = flattenTreeNodes(RECORDED_FACTORY_PLAYGROUND_TREE.topics);
    expect(flat).toHaveLength(RECORDED_FACTORY_PLAYGROUND_TREE.total_topics);
    expect(flat.every((t) => t.status === "proposed")).toBe(true);
    // A recorded zero is a zero — carried, never dropped as "absent".
    expect(flat[0].counts).toEqual({ pages: 0, planned: 0, keywords: 0 });
    expect(flat.filter((t) => t.depth === 0).map((t) => t.slug)).toEqual(
      RECORDED_FACTORY_PLAYGROUND_TREE.topics.map((t) => t.slug),
    );
    const rows = topicTreeRows(flat, { expanded: expandableSlugs(flat), selected: null });
    expect(rows).toHaveLength(52);
  });

  it("omits counts when the read did not include them, and honours children_count", () => {
    const flat = flattenTreeNodes([{ slug: "a", name: "A", children_count: 3 }]);
    expect(flat[0].counts).toBeUndefined();
    expect(flat[0].hasChildren).toBe(true);
  });
});

describe("topicTreeRows", () => {
  const topics = flattenProposalNodes(DOCUMENTED_PROPOSAL.topics);

  it("shows every row when every branch is expanded", () => {
    const rows = topicTreeRows(topics, { expanded: expandableSlugs(topics), selected: null });
    expect(rows.map((r) => r.id)).toEqual([
      "recycling",
      "metals",
      "metals-copper",
      "metals-aluminum",
      "e-waste",
    ]);
    expect(rows[1].expanded).toBe(true);
    expect(rows[1].status).toBe("proposed");
  });

  it("hides everything under a collapsed branch and nothing beside it", () => {
    const rows = topicTreeRows(topics, { expanded: new Set(["recycling"]), selected: "e-waste" });
    expect(rows.map((r) => r.id)).toEqual(["recycling", "metals", "e-waste"]);
    expect(rows.find((r) => r.id === "metals")?.expanded).toBe(false);
    expect(rows.find((r) => r.id === "e-waste")?.selected).toBe(true);
  });

  it("marks checked rows only when the host tracks checks", () => {
    const withChecks = topicTreeRows(topics, {
      expanded: new Set(),
      selected: null,
      checked: new Set(["recycling"]),
    });
    expect(withChecks[0].checked).toBe(true);
    const without = topicTreeRows(topics, { expanded: new Set(), selected: null });
    expect(without[0].checked).toBeUndefined();
  });
});

describe("topicPathNames", () => {
  it("answers root-first names", () => {
    const topics = flattenProposalNodes(DOCUMENTED_PROPOSAL.topics);
    expect(topicPathNames(topics, "metals-copper")).toEqual(["Recycling", "Metals", "Copper"]);
  });
});

describe("orphanedProposalNodes", () => {
  it("names every node whose parent the proposal does not contain, and nothing else", () => {
    const nodes = [
      { __kind: "map_topic_node_v1", slug: "a", name: "A", parent_slug: null },
      { __kind: "map_topic_node_v1", slug: "b", name: "B", parent_slug: "a" },
      { __kind: "map_topic_node_v1", slug: "c", name: "C", parent_slug: "ghost" },
    ] as unknown as Parameters<typeof orphanedProposalNodes>[0];
    expect(orphanedProposalNodes(nodes).map((n) => n.slug)).toEqual(["c"]);
    expect(flattenProposalNodes(nodes).find((t) => t.slug === "c")?.depth).toBe(0);
  });
});
