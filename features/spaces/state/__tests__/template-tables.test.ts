// A template copied into another organization must not keep naming the source organization's tables
// (round 21, item 10): every table block — at any depth, inside columns — is pointed at its copy.
import type { SpaceBlock } from "../../contract";
import { repointTables, tableIdsIn } from "../template-tables";

const db = (id: string, tableId: string): SpaceBlock => ({ id, type: "database", props: { source: { kind: "table", tableId, viewId: "v-old" }, title: "Clients", inline: true } });

const PAGE: SpaceBlock[] = [
  { id: "t", type: "text", text: [{ text: "Plan" }] },
  { id: "L", type: "columnList", children: [
    { id: "A", type: "column", props: { width: 0.5 }, children: [db("d1", "src-clients")] },
    { id: "B", type: "column", props: { width: 0.5 }, children: [{ id: "N", type: "columnList", children: [
      { id: "N1", type: "column", props: { width: 0.5 }, children: [db("d2", "src-wins")] },
      { id: "N2", type: "column", props: { width: 0.5 }, children: [db("d3", "src-clients")] },
    ] }] },
  ] },
  { id: "e", type: "database", props: { source: { kind: "entity", token: "task" } } },
];

describe("template copy tables", () => {
  it("finds every table a page names, once", () => {
    expect(tableIdsIn(PAGE).sort()).toEqual(["src-clients", "src-wins"]);
  });
  it("points every block at the copy and drops the old table's view id; built-in sources stay", () => {
    const { blocks, changed } = repointTables(PAGE, new Map([["src-clients", "b-clients"], ["src-wins", "b-wins"]]));
    expect(changed).toBe(true);
    expect(tableIdsIn(blocks).sort()).toEqual(["b-clients", "b-wins"]);
    expect(JSON.stringify(blocks)).not.toContain("v-old");
    expect(blocks[2]).toEqual(PAGE[2]);
  });
  it("leaves a page with no outside tables unchanged", () => {
    expect(repointTables(PAGE, new Map()).changed).toBe(false);
  });
});
