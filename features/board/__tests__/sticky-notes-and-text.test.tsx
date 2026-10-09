/**
 * STICKY NOTES AND PLAIN TEXT — words ON the canvas (FigJam / Miro / tldraw).
 *
 * Arman, 2026-10-09: the notepad tool made a full Note tile; "that should be a
 * sticky note … just very simple text", stored as a Note in a "Sticky notes"
 * folder every person gets. Pins, on the real board model, document parser,
 * shapes layer and viewport:
 *  - a new sticky creates NO Note until its first typed character; typing
 *    creates exactly ONE Note, in the "Sticky notes" folder, in the board's
 *    organization; later words update that same Note;
 *  - a sticky's colour, size, place and Note id round-trip through save / load;
 *  - Tab while typing on a sticky makes the next sticky beside it, typing;
 *  - a saved label tile (the retired Text tool tile) loads as plain text with
 *    its id, words and place;
 *  - a double-click on empty board asks the host for plain text there.
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { BoardStore } from "../board/board-store";
import { BoardCameraStore } from "../engine/camera-store";
import { BoardCameraStoreContext } from "../engine/react";
import { parseBoardDocument, serializeBoardDocument, type BoardDocument } from "../board/document";
import { boundsOfPoints, hitShape } from "../engine/shapes";
import { makeSticky, nextStickyBeside, STICKY_GAP } from "../engine/canvas-text";
import { startStickyNoteSync, type StickyNoteStore } from "../board/sticky-notes";
import { ShapesLayer } from "../components/ShapesLayer";
import { BoardViewport } from "../components/BoardViewport";

const mockCreateNote = jest.fn();
const mockUpdateNote = jest.fn();
jest.mock("@/features/notes/service/notesService", () => ({
  createNote: (...a: unknown[]) => mockCreateNote(...a),
  updateNote: (...a: unknown[]) => mockUpdateNote(...a),
  fetchNotesByIds: async () => [],
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: async (org: string | null) => org ?? "active-org",
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Tile = { id: string; rect: { x: number; y: number; w: number; h: number } };

const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeNotes() {
  const created: string[] = [];
  const updated: [string, string][] = [];
  const store: StickyNoteStore = {
    create: jest.fn(async (text: string) => {
      created.push(text);
      return `note-${created.length}`;
    }),
    update: jest.fn(async (id: string, text: string) => {
      updated.push([id, text]);
    }),
    read: jest.fn(async () => new Map<string, string>()),
  };
  return { store, created, updated };
}

describe("a sticky note's words are a Note", () => {
  it("creates no Note until the first typed character, then exactly one", async () => {
    const board = new BoardStore<Tile>({ tiles: [] });
    const notes = fakeNotes();
    const stop = startStickyNoteSync(board, notes.store, { delayMs: 0 });
    const sticky = makeSticky({ x: 0, y: 0 });
    board.addShape(sticky);
    await flush();
    expect(notes.store.create).not.toHaveBeenCalled();
    expect(board.getShape(sticky.id)?.note).toBeUndefined();

    board.updateShape(sticky.id, { text: "Call the landlord" });
    board.updateShape(sticky.id, { text: "Call the landlord" }); // a repeat never files a second Note
    await flush();
    expect(notes.created).toEqual(["Call the landlord"]);
    expect(board.getShape(sticky.id)?.note).toBe("note-1");

    // Later words update the SAME Note.
    board.updateShape(sticky.id, { text: "Call the landlord Friday" });
    await flush();
    await flush();
    expect(notes.created).toHaveLength(1);
    expect(notes.updated).toEqual([["note-1", "Call the landlord Friday"]]);

    // Undo keeps the Note id (a forgotten id would file a second Note on the next keystroke).
    board.undo();
    expect(board.getShape(sticky.id)?.note).toBe("note-1");
    stop();
  });

  it("files the Note in the Sticky notes folder, in the board's organization", async () => {
    const { stickyNoteStore } = await import("../persistence/sticky-note-store");
    mockCreateNote.mockResolvedValue({ id: "n1" });
    const id = await stickyNoteStore("org-of-board").create("Pack the kitchen\nboxes in garage");
    expect(id).toBe("n1");
    expect(mockCreateNote).toHaveBeenCalledWith({
      label: "Pack the kitchen",
      content: "Pack the kitchen\nboxes in garage",
      folder_name: "Sticky notes",
      organization_id: "org-of-board",
    });
  });

  it("a copied sticky gets its own Note, never the original's", () => {
    const board = new BoardStore<Tile>({ tiles: [], shapes: [{ ...makeSticky({ x: 0, y: 0 }), text: "a", note: "note-9" }] });
    const [copy] = board.duplicateShapes([board.getShapes()[0].id]);
    expect(board.getShape(copy)?.note).toBeUndefined();
    expect(board.getShape(copy)?.text).toBe("a");
  });
});

describe("sticky notes are first-class board objects", () => {
  it("colour, size, place and Note id round-trip through save / load", () => {
    const sticky = { ...makeSticky({ x: 500, y: 300 }, { style: { sticky: "pink" }, size: 260 }), text: "Ideas", note: "note-7" };
    const doc: BoardDocument = { camera: { x: 0, y: 0, z: 1 }, nodes: [], groups: [], edges: [], shapes: [sticky] };
    const back = parseBoardDocument(JSON.parse(JSON.stringify(serializeBoardDocument(doc))));
    expect(back.problems).toEqual([]);
    expect(back.doc.shapes).toEqual([sticky]);
    expect(boundsOfPoints(back.doc.shapes[0].points)).toEqual({ x: 370, y: 170, w: 260, h: 260 });
  });

  it("a press anywhere on the card selects it", () => {
    const s = makeSticky({ x: 0, y: 0 });
    expect(hitShape(s, { x: 0, y: 0 }, 0, () => undefined)).toBe("fill");
    expect(hitShape(s, { x: 500, y: 0 }, 0, () => undefined)).toBeNull();
  });

  it("Tab while typing makes the next sticky beside it, same colour, and keeps typing there", async () => {
    const first = makeSticky({ x: 0, y: 0 }, { style: { sticky: "blue" } });
    const board = new BoardStore<Tile>({ tiles: [], shapes: [first] });
    const store = new BoardCameraStore({ x: 0, y: 0, z: 1 });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <BoardCameraStoreContext.Provider value={store}>
          <ShapesLayer board={board} />
        </BoardCameraStoreContext.Provider>,
      ),
    );
    await act(async () => {
      store.select(first.id);
      store.setEditing(first.id);
    });
    const area = host.querySelector('textarea[aria-label="Sticky note"]') as HTMLTextAreaElement;
    expect(area).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area, "Book movers");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      area.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    const stickies = board.getShapes().filter((s) => s.kind === "sticky");
    expect(stickies).toHaveLength(2);
    expect(stickies[0].text).toBe("Book movers");
    const next = stickies[1];
    expect(next.style?.sticky).toBe("blue");
    const a = boundsOfPoints(stickies[0].points);
    expect(boundsOfPoints(next.points)).toEqual({ x: a.x + a.w + STICKY_GAP, y: a.y, w: a.w, h: a.h });
    expect(store.getEditing()).toBe(next.id);
    expect(nextStickyBeside(first).kind).toBe("sticky");
    act(() => root.unmount());
    host.remove();
  });
});

describe("plain text", () => {
  it("a saved label tile loads as plain text with its id, words and place", () => {
    const raw = {
      camera: { x: 0, y: 0, z: 1 },
      nodes: [{ id: "text:abc", rect: { x: 40, y: 60, w: 520, h: 120 }, title: "Label", source: { kind: "label", text: "Q3 launch" } }],
      edges: [],
    };
    const { doc, problems } = parseBoardDocument(raw);
    expect(problems).toEqual([]);
    expect(doc.nodes).toEqual([]);
    expect(doc.shapes).toHaveLength(1);
    const t = doc.shapes[0];
    expect(t).toMatchObject({ id: "text:abc", kind: "text", text: "Q3 launch", wrap: true });
    expect(boundsOfPoints(t.points)).toEqual({ x: 40, y: 60, w: 520, h: 120 });
    // One-time: the next save writes the text object, never a label node again.
    const saved = serializeBoardDocument(doc);
    expect(saved.nodes.some((n) => (n as { source?: { kind?: string } }).source?.kind === "label")).toBe(false);
    expect(parseBoardDocument(JSON.parse(JSON.stringify(saved))).doc.shapes).toEqual(doc.shapes);
  });

  it("a double-click on empty board asks for text there; on a tile it does not", async () => {
    const onEmpty = jest.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <BoardViewport initialCamera={{ x: 0, y: 0, z: 1 }} fitOnMount={false} onEmptyDoubleClick={onEmpty}>
          <div data-board-tile="t1" style={{ position: "absolute" }}>
            <span id="inside-tile">tile</span>
          </div>
        </BoardViewport>,
      ),
    );
    const boardRoot = host.querySelector("[data-board-root]") as HTMLElement;
    expect(boardRoot).not.toBeNull();
    await act(async () => {
      host.querySelector("#inside-tile")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 10, clientY: 10 }));
    });
    expect(onEmpty).not.toHaveBeenCalled();
    await act(async () => {
      boardRoot.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 120, clientY: 80 }));
    });
    expect(onEmpty).toHaveBeenCalledTimes(1);
    const at = onEmpty.mock.calls[0][0] as { x: number; y: number };
    expect(Number.isFinite(at.x) && Number.isFinite(at.y)).toBe(true);
    act(() => root.unmount());
    host.remove();
  });
});
