// SI-13: "on N boards" counts the OTHER saved boards holding the same record, from stored nodes alone.
import { buildReuseIndex, otherBoardsOf } from "../board/reuse";

const note = (id: string) => ({ id: `t-${id}`, rect: { x: 0, y: 0, w: 1, h: 1 }, title: "n", source: { kind: "entity", entity: "note", id } });
const boards = [
  { id: "b1", title: "Monday", nodes: [note("n1"), note("n2"), { id: "g", group: true, title: "frame" }] },
  { id: "b2", title: "Launch", nodes: [note("n1"), note("n1"), { id: "s", shape: true }, { id: "x", title: "no source" }] },
  { id: "b3", title: "Empty", nodes: [{ id: "t", title: "label", rect: {}, source: { kind: "label", text: "hi" } }] },
  { id: "b4", title: "Broken", nodes: "not a list" },
];

describe("reuse index", () => {
  const index = buildReuseIndex(boards);
  it("lists every board holding a record, once per board", () => {
    expect(index.get("note:n1")?.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(index.get("note:n2")?.map((b) => b.id)).toEqual(["b1"]);
  });
  it("answers with the other boards only", () => {
    const src = { kind: "entity", entity: "note", id: "n1" } as const;
    expect(otherBoardsOf(index, src, "b1").map((b) => b.title)).toEqual(["Launch"]);
    expect(otherBoardsOf(index, { kind: "entity", entity: "note", id: "n2" }, "b1")).toEqual([]);
  });
  it("ignores board-only content, drafts and unreadable boards", () => {
    expect(otherBoardsOf(index, { kind: "label", text: "hi" }, "b1")).toEqual([]);
    expect(otherBoardsOf(index, { kind: "entity", entity: "note", id: null }, "b1")).toEqual([]);
    expect(index.size).toBe(2);
  });
});
