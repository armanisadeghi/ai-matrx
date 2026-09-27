import { act } from "react";
import { createRoot } from "react-dom/client";
import { rectsIntersect } from "@/features/spatial/engine/camera";
import { getRegisteredSurfaceClientTools } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { type BoardToolHost, useBoardAgentTools } from "@/features/spatial/tools/useBoardAgentTools";
import type { ThreadTab } from "@/features/war-room/types";
import {
  type BoardLayout,
  type ThreadParts,
  emptyBoardLayout,
  partKey,
  placeMissingParts,
  serializeBoardLayout,
  threadFrame,
} from "../boardLayout";
import { ROOM_BOARD_REFUSALS, type RoomPartTile, partKind, roomBoardToolHost } from "../roomBoardAgent";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const TABS: ThreadTab[] = ["task", "notes", "audio", "agent", "files", "entity:dataset"];
const THREADS: ThreadParts[] = [
  { threadId: A, tabs: TABS },
  { threadId: B, tabs: TABS },
];

/** A War Room board wired to the REAL tool handlers, with a recording commit. */
function mount() {
  let layout: BoardLayout = { ...emptyBoardLayout(), parts: placeMissingParts(THREADS, {}) };
  const commits: BoardLayout[] = [];
  const notes: Record<string, string> = {};
  const restored: string[] = [];
  const parkedToasts: string[] = [];
  const surface = `test/war-room-board-${Math.random()}`;
  const host: BoardToolHost<RoomPartTile> = {
    ...roomBoardToolHost({
      getLayout: () => layout,
      commit: (next) => {
        layout = next;
        commits.push(next);
      },
      threads: THREADS,
      threadTitle: (id) => (id === A ? "Acme diligence" : "Vendor review"),
      partLabel: (_id, tab) => partKind(tab),
      onParked: (key) => parkedToasts.push(key),
      restore: (key) => restored.push(key),
      writeNote: (threadId, text) => {
        notes[threadId] = text;
        return null;
      },
      statusOf: (_id, tab) => (tab === "task" ? "2/5 done" : null),
    }),
    store: null,
    boardTitle: "Acme acquisition",
  };
  function Probe() {
    useBoardAgentTools(surface, host);
    return null;
  }
  act(() => {
    createRoot(document.createElement("div")).render(<Probe />);
  });
  const call = (tool: string, input: unknown = {}) => getRegisteredSurfaceClientTools(surface)[tool]?.(input);
  return { call, commits, notes, restored, parkedToasts, layout: () => layout };
}

describe("War Room board agent tools", () => {
  it("board_read lists parts as tiles with kind and status, and threads as frames", () => {
    const b = mount();
    const read = b.call("board_read", { include_text: false }) as {
      ok: boolean;
      board: { tiles: { id: string; kind: string; status: string | null; title: string }[]; frames: { id: string; title: string }[] };
    };
    expect(read.ok).toBe(true);
    expect(read.board.frames.map((f) => [f.id, f.title])).toEqual([
      [A, "Acme diligence"],
      [B, "Vendor review"],
    ]);
    const kinds = read.board.tiles.filter((t) => t.id.startsWith(A)).map((t) => t.kind);
    expect(kinds).toEqual(["task", "notes", "audio", "chat", "resources", "attachments"]);
    expect(read.board.tiles.find((t) => t.id === partKey(A, "task"))?.status).toBe("2/5 done");
  });

  it("board_move_tiles persists through the layout path, and a thread id moves the whole frame", () => {
    const b = mount();
    const before = b.layout().parts[partKey(B, "notes")];
    const f0 = threadFrame(B, TABS, b.layout().parts);
    const res = b.call("board_move_tiles", { moves: [{ id: B, x: 5000, y: 5000 }] }) as { ok: boolean };
    expect(res.ok).toBe(true);
    expect(b.commits).toHaveLength(1);
    const frame = threadFrame(B, TABS, b.layout().parts);
    expect(frame && { x: frame.x, y: frame.y }).toEqual({ x: 5000, y: 5000 });
    const after = b.layout().parts[partKey(B, "notes")];
    expect([after.x - before.x, after.y - before.y]).toEqual([5000 - (f0?.x ?? 0), 5000 - (f0?.y ?? 0)]);
    // What is committed is what gets saved on the room row.
    const saved = serializeBoardLayout(b.layout(), [A, B]) as { parts: Record<string, { x: number }> };
    expect(saved.parts[partKey(B, "notes")].x).toBe(Math.round(after.x));
  });

  it("refuses a move that would make two frames overlap, and moves nothing", () => {
    const b = mount();
    const fa = threadFrame(A, TABS, b.layout().parts);
    const res = b.call("board_move_tiles", { moves: [{ id: B, x: fa?.x ?? 0, y: fa?.y ?? 0 }] }) as {
      ok: boolean;
      error: string;
    };
    expect(res.ok).toBe(false);
    expect(res.error).toContain('"Acme diligence" and "Vendor review" overlap');
    expect(b.commits).toHaveLength(0);
  });

  it("board_arrange works inside one thread and refuses across threads", () => {
    const b = mount();
    const across = b.call("board_arrange", { layout: "row" }) as { ok: boolean; error: string };
    expect(across).toEqual({ ok: false, error: ROOM_BOARD_REFUSALS.arrange });
    const ids = [partKey(A, "task"), partKey(A, "notes")];
    const within = b.call("board_arrange", { layout: "column", ids }) as { ok: boolean };
    expect(within.ok).toBe(true);
    const fa = threadFrame(A, TABS, b.layout().parts);
    const fb = threadFrame(B, TABS, b.layout().parts);
    expect(fa && fb && rectsIntersect(fa, fb)).toBe(false);
  });

  it("park, remove and restore go through the part state, remove returns an undo", () => {
    const b = mount();
    const key = partKey(A, "audio");
    expect(b.call("board_park", { id: key, parked: true })).toMatchObject({ ok: true, parked: true });
    expect(b.layout().parked).toEqual([key]);
    expect(b.parkedToasts).toEqual([key]);
    expect(b.call("board_park", { id: key, parked: false })).toMatchObject({ ok: true });
    expect(b.layout().parked).toEqual([]);
    const gone = partKey(A, "files");
    expect(b.call("board_remove_tile", { id: gone })).toMatchObject({ ok: true });
    expect(b.layout().removed).toEqual([gone]);
    const read = b.call("board_read", { include_text: false }) as { board: { tiles: { id: string; removed?: boolean }[] } };
    expect(read.board.tiles.find((t) => t.id === gone)?.removed).toBe(true);
    // A removed part comes back with board_park parked:false.
    b.call("board_park", { id: gone, parked: false });
    expect(b.layout().removed).toEqual([]);
  });

  it("text on a Notes part writes the thread's note; other edits refuse with the remedy", () => {
    const b = mount();
    const ok = b.call("board_update_tile", { id: partKey(A, "notes"), text: "# Findings" }) as { ok: boolean };
    expect(ok.ok).toBe(true);
    expect(b.notes[A]).toBe("# Findings");
    expect(b.commits).toHaveLength(0);
    const task = b.call("board_update_tile", { id: partKey(A, "task"), text: "x" }) as { ok: boolean; error: string };
    expect(task.ok).toBe(false);
    expect(task.error).toContain(`"${partKey(A, "notes")}"`);
    const html = b.call("board_update_tile", { id: partKey(A, "notes"), html: "<p>x</p>" }) as { error: string };
    expect(html.error).toContain("pass `text`");
    expect(b.call("board_update_tile", { id: partKey(A, "notes"), title: "Renamed" })).toEqual({
      ok: false,
      error: ROOM_BOARD_REFUSALS.update,
    });
  });

  it("add, group, connect and undo refuse with their remedies", () => {
    const b = mount();
    const add = b.call("board_add_tile", { kind: "note", text: "hi" }) as { ok: boolean; error: string };
    expect(add.ok).toBe(false);
    expect(add.error).toContain("Parts come from the thread");
    expect(add.error).toContain(partKey(A, "notes"));
    expect(b.call("board_group", { ids: [partKey(A, "task")], title: "G" })).toEqual({
      ok: false,
      error: ROOM_BOARD_REFUSALS.group,
    });
    expect(ROOM_BOARD_REFUSALS.group).toContain("groups are threads");
    expect(b.call("board_connect", { from_id: partKey(A, "task"), to_id: partKey(B, "task") })).toEqual({
      ok: false,
      error: ROOM_BOARD_REFUSALS.connect,
    });
    expect(b.call("board_undo")).toEqual({ ok: false, error: ROOM_BOARD_REFUSALS.undo });
    expect(b.commits).toHaveLength(0);
  });
});
