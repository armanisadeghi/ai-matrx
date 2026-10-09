// SI-13: using a SAVED template gives independent records (editing the copy's note never edits the template's).
import { cloneBoardContent, clonableRecords, type CloneServices } from "../templates/clone-content";
import type { BoardDocument } from "../board/document";

const rect = { x: 0, y: 0, w: 100, h: 100 };
const doc: BoardDocument = {
  camera: { x: 0, y: 0, z: 1 },
  nodes: [
    { id: "t1", rect, title: "Post", source: { kind: "entity", entity: "note", id: "note-A" }, basics: { values: { label: "x" }, at: "now" } },
    { id: "t2", rect, title: "Chat", source: { kind: "entity", entity: "chat", id: "conv-1", meta: { agentId: "ag" } } },
    { id: "t3", rect, title: "Draft", source: { kind: "entity", entity: "udt_document", id: "doc-A" } },
    { id: "t4", rect, title: "Legacy", source: { kind: "document", documentId: "doc-B" } },
    { id: "t5", rect, title: "Brand kit", source: { kind: "file", fileId: "file-1" } },
    { id: "t6", rect, title: "Table", source: { kind: "record", tableId: "tb", recordId: "r" } },
    { id: "t7", rect, title: "Task", source: { kind: "entity", entity: "task", id: "task-1" } },
    { id: "t8", rect, title: "Write-up", source: { kind: "text", markdown: "hello" } },
  ],
  groups: [{ id: "g1", rect, title: "Frame" }],
  edges: [{ id: "e1", from: "t1", to: "t2" }, { id: "e2", from: "t2", to: "gone" }],
  shapes: [],
};

function services() {
  let n = 0;
  const calls: string[] = [];
  const s: CloneServices = {
    copyNote: async (id) => (calls.push(`note:${id}`), { id: `note-copy-${++n}` }),
    copyDocument: async (id) => (calls.push(`doc:${id}`), { id: `doc-copy-${++n}` }),
  };
  return { s, calls };
}

describe("cloneBoardContent (a saved template use)", () => {
  it("gives notes and documents fresh ids and keeps shared library items by reference", async () => {
    const { s, calls } = services();
    let k = 0;
    const out = await cloneBoardContent(doc, s, () => `new-${++k}`);
    const by = Object.fromEntries(out.nodes.map((n) => [n.title, n.source]));
    expect(calls.sort()).toEqual(["doc:doc-A", "doc:doc-B", "note:note-A"]);
    expect(by.Post).toMatchObject({ entity: "note", id: expect.stringMatching(/^note-copy-/) });
    expect((by.Post as { id: string }).id).not.toBe("note-A");
    expect(by.Draft).toMatchObject({ entity: "udt_document", id: expect.stringMatching(/^doc-copy-/) });
    expect(by.Legacy).toMatchObject({ kind: "document", documentId: expect.stringMatching(/^doc-copy-/) });
    // chats start their own conversation with the same agent
    expect(by.Chat).toEqual({ kind: "entity", entity: "chat", id: null, meta: { agentId: "ag" } });
    // shared items stay linked
    expect(by["Brand kit"]).toEqual(doc.nodes[4].source);
    expect(by.Table).toEqual(doc.nodes[5].source);
    expect(by.Task).toEqual(doc.nodes[6].source);
    expect(by["Write-up"]).toEqual(doc.nodes[7].source);
  });

  it("mints fresh tile ids, re-points lines, drops dangling lines, drops stale basics", async () => {
    const { s } = services();
    let k = 0;
    const out = await cloneBoardContent(doc, s, () => `new-${++k}`);
    const ids = out.nodes.map((n) => n.id);
    expect(ids.some((i) => doc.nodes.some((o) => o.id === i))).toBe(false);
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0].from).toBe(ids[0]);
    expect(out.edges[0].to).toBe(ids[1]);
    expect(out.nodes[0].basics).toBeUndefined();
    expect(out.groups).toHaveLength(1);
  });

  it("does not touch the template: the source document is unchanged", async () => {
    const { s } = services();
    const before = JSON.stringify(doc);
    await cloneBoardContent(doc, s);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("clones one record once even when two tiles hold it", async () => {
    const { s, calls } = services();
    const two: BoardDocument = { ...doc, nodes: [doc.nodes[0], { ...doc.nodes[0], id: "t9" }], edges: [] };
    const out = await cloneBoardContent(two, s);
    expect(calls).toEqual(["note:note-A"]);
    expect((out.nodes[0].source as { id: string }).id).toBe((out.nodes[1].source as { id: string }).id);
  });

  it("a failed clone throws (nothing is stored half-copied)", async () => {
    const s: CloneServices = { copyNote: async () => { throw new Error("no access"); }, copyDocument: async () => ({ id: "x" }) };
    await expect(cloneBoardContent(doc, s)).rejects.toThrow("no access");
  });

  it("lists the records a use would clone", () => {
    expect(clonableRecords(doc)).toEqual([
      { kind: "note", id: "note-A" },
      { kind: "document", id: "doc-A" },
      { kind: "document", id: "doc-B" },
    ]);
  });
});
