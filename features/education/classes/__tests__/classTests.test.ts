/**
 * A class has units; tests cover one or many of them, and studying for a test
 * combines the material of its units. Each rule names the defect it guards.
 */
import type { ContainerLink } from "@ai-matrx/associations/react";
import { classContentLinks, classPartIds, groupsInPart, partMembership, type PartEdge } from "../classParts";
import {
  classTestLinks,
  itemsInUnits,
  practiceTestSources,
  sortTests,
  testCoverage,
  testDateOf,
  testDeckIds,
  testEdgeMetadata,
} from "../classTests";

const U1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const U2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const U3 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TEST = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function link(token: string, id: string, role: string | null, metadata: unknown = {}): ContainerLink {
  return { edgeId: `${token}:${id}`, token, resourceId: id, role, label: null, metadata };
}

describe("tests among the class's links", () => {
  const links = [
    link("scope", U1, "part_of"),
    link("scope", U2, "part_of"),
    link("scope", TEST, "part_of", testEdgeMetadata("2026-12-10")),
    link("fc_set", "deck", null),
  ];

  it("a test is not a unit (it joins the class by the same part_of edge)", () => {
    expect(classPartIds(links)).toEqual([U1, U2]);
  });
  it("tests are read from their marked edge, with the date members need", () => {
    const found = classTestLinks(links);
    expect(found.map((l) => l.resourceId)).toEqual([TEST]);
    expect(testDateOf(found[0])).toBe("2026-12-10");
  });
  it("neither units nor tests are content", () => {
    expect(classContentLinks(links).map((l) => l.resourceId)).toEqual(["deck"]);
  });
  it("a bad date is dropped, never stored", () => {
    expect(testEdgeMetadata("soon").date).toBeNull();
  });
});

describe("what a test covers", () => {
  const edges: PartEdge[] = [
    { targetId: U1, sourceType: "scope", sourceId: TEST, role: "covers" },
    { targetId: U2, sourceType: "scope", sourceId: TEST, role: "covers" },
    { targetId: U2, sourceType: "scope", sourceId: TEST, role: "covers" },
    { targetId: U3, sourceType: "scope", sourceId: TEST, role: "covers" }, // not a unit of this class
    { targetId: U1, sourceType: "fc_set", sourceId: "deck", role: null },
  ];
  it("reads covers edges into the class's units only, once each", () => {
    expect(testCoverage(edges, [TEST], [U1, U2]).get(TEST)).toEqual([U1, U2]);
  });
  it("covers edges are not membership: a test never lists as unit content", () => {
    expect(partMembership(edges, [U1, U2]).get(U1)).toEqual(new Set(["fc_set:deck"]));
  });
});

describe("combining the material of the covered units", () => {
  const item = (token: string, entityId: string) => ({ token, entityId, edgeId: `${token}${entityId}` });
  const groups = [
    { items: [item("fc_set", "d1"), item("fc_set", "d2")] },
    { items: [item("note", "n1"), item("file", "f1"), item("assessment", "q1")] },
    { items: [item("processed_document", "p1")] },
  ];
  const membership = new Map([
    [U1, new Set(["fc_set:d1", "note:n1", "file:f1"])],
    [U2, new Set(["fc_set:d1", "fc_set:d2", "processed_document:p1"])],
    [U3, new Set(["assessment:q1"])],
  ]);

  it("an item filed in two covered units appears once", () => {
    const items = itemsInUnits(groups, membership, [U1, U2]);
    expect(items.map((i) => `${i.token}:${i.entityId}`).sort()).toEqual([
      "fc_set:d1",
      "fc_set:d2",
      "file:f1",
      "note:n1",
      "processed_document:p1",
    ]);
  });
  it("nothing from an uncovered unit joins", () => {
    expect(itemsInUnits(groups, membership, [U1]).some((i) => i.token === "processed_document")).toBe(false);
  });
  it("practice-test sources are the files, documents and notes, each once", () => {
    const sources = practiceTestSources(itemsInUnits(groups, membership, [U1, U2]));
    expect(sources.map((s) => s.token).sort()).toEqual(["file", "note", "processed_document"]);
  });
  it("study opens the decks of the covered units, each once", () => {
    expect(testDeckIds(itemsInUnits(groups, membership, [U1, U2])).sort()).toEqual(["d1", "d2"]);
  });
  it("the test page's groups are the shared unit filter over the union", () => {
    const keys = new Set(itemsInUnits(groups, membership, [U1, U2]).map((i) => `${i.token}:${i.entityId}`));
    expect(groupsInPart(groups, keys).flatMap((g) => g.items).length).toBe(5);
  });
});

describe("sortTests", () => {
  it("soonest dated test first, undated after", () => {
    const sorted = sortTests([
      { name: "Final", date: null },
      { name: "Final", date: "2026-12-10" },
      { name: "Midterm", date: "2026-10-20" },
    ]);
    expect(sorted.map((t) => t.date)).toEqual(["2026-10-20", "2026-12-10", null]);
  });
});
