/**
 * FU-37: four board follow-ups.
 *  1. The Add menu's Canvas section has Sticky note, Text, Frame, Draw, Shapes (no Label); the Sticky /
 *     Text rows make the object through the ONE creator, they do not just arm a tool.
 *  2. A copied board (template use, Duplicate board) never shares a sticky note's Note.
 *  3. ONE connector model: a tile-to-tile connection IS a bound arrow shape; the old `edges[]` migrate on load.
 *  4. Tiles duplicate (board-only content copies, a record without a copy action is "already on the board")
 *     and have a layer order, through the same selection actions section.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(globalThis, { ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } });
Element.prototype.scrollIntoView = () => {};

import { AddMenu } from "../home/AddMenu";
import { buildAddRows } from "../home/add-menu-rows";
import { BOARD_ITEM_TYPES } from "../items/catalog";
import { startNewEntries } from "../items/types";
import { BoardStore, type BoardTileBase } from "../board/board-store";
import { parseBoardDocument, serializeBoardDocument, toJsonCanvas, type BoardDocument } from "../board/document";
import { connectionsOf } from "../board/connections";
import { cloneBoardContent, detachStickyNotes, type CloneServices } from "../templates/clone-content";
import { copyTileContent } from "../items/tile-copy";
import { selectionActionsSection } from "../components/ShapeToolbarSections";
import type { BoardShape } from "../engine/shapes";

type Tile = BoardTileBase & { title: string };
const tile = (id: string, x = 0, y = 0): Tile => ({ id, title: id, rect: { x, y, w: 100, h: 80 } });
const stickyShape = (id: string, note?: string): BoardShape => ({
  id,
  kind: "sticky",
  points: [{ x: 0, y: 0 }, { x: 220, y: 220 }],
  text: "Ship Friday",
  ...(note ? { note } : {}),
});

describe("1. Add menu Canvas section", () => {
  it("offers Sticky note, Text, Frame, Draw, Shapes and no Label row", () => {
    const rows = buildAddRows(BOARD_ITEM_TYPES).filter((r) => r.section === "canvas" && !r.searchOnly);
    expect(rows.map((r) => r.label)).toEqual(["Sticky note", "Text", "Frame", "Draw", "Shapes"]);
    expect(buildAddRows(BOARD_ITEM_TYPES).some((r) => r.label === "Label")).toBe(false);
    const label = BOARD_ITEM_TYPES.find((t) => t.key === "label");
    expect(label).toBeDefined(); // still renders a tile that is already on a board
    expect(startNewEntries(label!)).toEqual([]);
  });

  it("the Text row makes plain text through the creator (onCanvasText), it does not arm a tool", async () => {
    const onCanvasText = jest.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<AddMenu types={[]} onStartNew={jest.fn()} onBringIn={jest.fn()} onCanvasText={onCanvasText} />));
    await act(async () => (host.querySelector("button") as HTMLButtonElement).click());
    const item = (label: string) =>
      Array.from(document.querySelectorAll("[cmdk-item]")).find((e) => e.textContent === label) as HTMLElement;
    await act(async () => item("Text").click());
    expect(onCanvasText).toHaveBeenCalledWith("text");
    await act(async () => (host.querySelector("button") as HTMLButtonElement).click());
    await act(async () => item("Sticky note").click());
    expect(onCanvasText).toHaveBeenLastCalledWith("sticky");
    await act(async () => root.unmount());
    document.body.innerHTML = "";
  });
});

describe("2. a copied board never shares a Note", () => {
  const doc: BoardDocument = {
    camera: { x: 0, y: 0, z: 1 },
    nodes: [{ id: "t1", rect: { x: 0, y: 400, w: 100, h: 80 }, title: "Chat", source: { kind: "entity", entity: "task", id: "k" } }],
    groups: [],
    edges: [],
    shapes: [
      stickyShape("s1", "note-A"),
      stickyShape("s2"),
      { id: "a1", kind: "arrow", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], bind: { start: "s1", end: "t1" } },
    ],
  };
  const services: CloneServices = { copyNote: async () => ({ id: "x" }), copyDocument: async () => ({ id: "y" }) };

  it("detachStickyNotes clears the Note id and keeps the words", () => {
    const out = detachStickyNotes(doc);
    expect(out.shapes[0]).toMatchObject({ id: "s1", text: "Ship Friday" });
    expect(out.shapes[0].note).toBeUndefined();
    expect(detachStickyNotes(out)).toBe(out);
  });

  it("a template use clears every sticky's note id and re-points a bound arrow at the new ids", async () => {
    let n = 0;
    const out = await cloneBoardContent(doc, services, () => `n${++n}`);
    expect(out.shapes.some((s) => s.note)).toBe(false);
    const sticky = out.shapes.find((s) => s.text === "Ship Friday")!;
    const arrow = out.shapes.find((s) => s.kind === "arrow")!;
    expect(arrow.bind).toEqual({ start: out.shapes[0].id, end: out.nodes[0].id });
    expect(out.shapes.map((s) => s.id)).not.toContain("s1");
    expect(sticky.text).toBe("Ship Friday");
  });
});

describe("3. one connector model", () => {
  const stored = {
    camera: { x: 0, y: 0, z: 1 },
    nodes: [
      { id: "a", rect: { x: 0, y: 0, w: 100, h: 80 }, title: "A", source: { kind: "text", markdown: "a" } },
      { id: "b", rect: { x: 400, y: 0, w: 100, h: 80 }, title: "B", source: { kind: "text", markdown: "b" } },
    ],
    edges: [{ id: "link:1", from: "a", to: "b" }, { id: "link:2", from: "a", to: "gone" }],
  };

  it("an old edge loads as a bound arrow with the same id; a dangling one is reported; edges save empty", () => {
    const { doc, problems } = parseBoardDocument(stored);
    expect(doc.edges).toEqual([]);
    expect(doc.shapes).toHaveLength(1);
    expect(doc.shapes[0]).toMatchObject({ id: "link:1", kind: "arrow", bind: { start: "a", end: "b" } });
    expect(problems.join(" ")).toContain("link:2");
    const saved = serializeBoardDocument(doc);
    expect(saved.edges).toEqual([]);
    expect(parseBoardDocument(JSON.parse(JSON.stringify(saved))).doc.shapes).toEqual(doc.shapes);
  });

  it("a document built with edges in code (a built-in template) saves them as arrows", () => {
    const { doc } = parseBoardDocument(stored);
    const saved = serializeBoardDocument({ ...doc, shapes: [], edges: [{ id: "link:1", from: "a", to: "b" }] });
    expect(saved.edges).toEqual([]);
    expect(saved.nodes.some((n) => (n as { id?: string; shape?: boolean }).id === "link:1" && (n as { shape?: boolean }).shape)).toBe(true);
  });

  it("connect() draws a bound arrow; the connection list is read back from it; restyle and disconnect work on it", () => {
    const board = new BoardStore<Tile>([tile("a"), tile("b", 400)]);
    board.connect({ id: "link:x", from: "a", to: "b" });
    board.connect({ id: "link:dup", from: "a", to: "b" });
    expect(board.shapes).toHaveLength(1);
    expect(board.shapes[0]).toMatchObject({ id: "link:x", kind: "arrow", bind: { start: "a", end: "b" } });
    expect(board.read().connections).toEqual([{ id: "link:x", from: "a", to: "b" }]);
    board.restyleShapes(["link:x"], { stroke: "rose", dash: "dashed" });
    expect(board.getShape("link:x")!.style).toMatchObject({ stroke: "rose", dash: "dashed" });
    expect(board.connections).toHaveLength(1);
    board.disconnect("link:x");
    expect(board.shapes).toEqual([]);
    expect(board.connections).toEqual([]);
    board.undo();
    expect(board.connections).toHaveLength(1);
  });

  it("a seeded connection becomes the arrow, and moving a tile keeps the layout's list the same object", () => {
    const board = new BoardStore<Tile>({ tiles: [tile("a"), tile("b", 400)], connections: [{ id: "c1", from: "a", to: "b" }] });
    expect(board.shapes[0]).toMatchObject({ id: "c1", kind: "arrow", bind: { start: "a", end: "b" } });
    const before = board.getLayout();
    board.moveTile("a", 50, 50);
    expect(board.getLayout().connections).toBe(before.connections);
    expect(board.getLayout().tileIds).toEqual(before.tileIds);
  });

  it("the arrow follows its tile (live ends) and a tile's removal takes its connections along, undo brings them back", () => {
    const board = new BoardStore<Tile>([tile("a"), tile("b", 400), tile("c", 800)]);
    board.connect({ id: "ab", from: "a", to: "b" });
    board.connect({ id: "bc", from: "b", to: "c" });
    const restore = board.removeTile("b");
    expect(board.connections).toEqual([]);
    expect(board.shapes).toEqual([]);
    restore();
    expect(board.connections.map((c) => c.id)).toEqual(["ab", "bc"]);
    board.removeMany(["a"]);
    expect(board.connections.map((c) => c.id)).toEqual(["bc"]);
  });

  it("a bound arrow with a loose end or a shape end is not a connection; JSON Canvas exports connections as edges", () => {
    const shapes: BoardShape[] = [
      { id: "x", kind: "arrow", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], bind: { start: "a" } },
      { id: "y", kind: "arrow", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], bind: { start: "a", end: "rect:1" } },
      { id: "z", kind: "line", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], bind: { start: "a", end: "b" } },
    ];
    expect(connectionsOf(shapes, (id) => id === "a" || id === "b")).toEqual([]);
    const { doc } = parseBoardDocument(stored);
    expect(toJsonCanvas(doc, "https://x.test").edges).toEqual([{ id: "link:1", fromNode: "a", toNode: "b" }]);
  });
});

describe("4. tiles duplicate and have a layer order", () => {
  it("board-only content and chats copy; a note copies through its copy action; other records are skipped", async () => {
    const s: CloneServices = {
      copyNote: jest.fn(async () => ({ id: "note-2", label: "Plan (Copy)" })),
      copyDocument: jest.fn(async () => ({ id: "doc-2", name: "Doc (Copy)" })),
    };
    expect(await copyTileContent({ title: "W", source: { kind: "text", markdown: "hi" } }, s)).toEqual({ title: "W", source: { kind: "text", markdown: "hi" } });
    expect(await copyTileContent({ title: "P", source: { kind: "html", url: "https://a.test" } }, s)).not.toBeNull();
    expect(await copyTileContent({ title: "C", source: { kind: "entity", entity: "chat", id: "conv", meta: { agentId: "g" } } }, s)).toEqual({
      title: "C",
      source: { kind: "entity", entity: "chat", id: null, meta: { agentId: "g" } },
    });
    expect(await copyTileContent({ title: "Plan", source: { kind: "entity", entity: "note", id: "note-1" } }, s)).toEqual({
      title: "Plan (Copy)",
      source: { kind: "entity", entity: "note", id: "note-2" },
    });
    expect(s.copyNote).toHaveBeenCalledWith("note-1");
    for (const source of [
      { kind: "file", fileId: "f" },
      { kind: "image", fileId: "f" },
      { kind: "record", tableId: "t", recordId: "r" },
      { kind: "entity", entity: "task", id: "k" },
      { kind: "entity", entity: "note", id: null },
    ] as const) {
      expect(await copyTileContent({ title: "x", source }, s)).toBeNull();
    }
  });

  it("reorderTiles: forward, backward, front, back, shelf left out, one undo step", () => {
    const board = new BoardStore<Tile>([tile("a"), tile("b"), tile("c"), tile("d")]);
    const order = () => board.getLayout().tileIds.join("");
    board.reorderTiles(["a"], "forward");
    expect(order()).toBe("bacd");
    board.reorderTiles(["d"], "backward");
    expect(order()).toBe("badc");
    board.reorderTiles(["b"], "front");
    expect(order()).toBe("adcb");
    board.reorderTiles(["b", "c"], "back");
    expect(order()).toBe("cbad");
    board.reorderTiles(["c"], "back"); // already at the back: nothing happens, no undo step
    const steps = board.canUndo;
    board.undo();
    expect(order()).toBe("adcb");
    expect(steps).toBe(true);
    board.parkTile("a");
    board.reorderTiles(["d"], "front");
    expect(order()).toBe("cbd");
  });

  it("the selection actions section offers order, duplicate and delete for a TILE, and nothing about style", async () => {
    const board = new BoardStore<Tile>([tile("a"), tile("b")]);
    const section = selectionActionsSection({ board, duplicate: () => true, remove: () => {} });
    expect(section.applies(["a"])).toBe(true);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<div>{section.render(["a"])}</div>));
    const names = Array.from(host.querySelectorAll("button")).map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(names.map((n) => n?.replace(/ \(.*\)$/, ""))).toEqual(["Bring to front", "Send to back", "Duplicate", "Delete"]);
    await act(async () => (host.querySelector('button[aria-label^="Bring to front"]') as HTMLButtonElement).click());
    expect(board.getLayout().tileIds.join("")).toBe("ba");
    await act(async () => root.unmount());
    document.body.innerHTML = "";
  });
});
