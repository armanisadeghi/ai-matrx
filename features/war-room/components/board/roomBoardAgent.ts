// features/war-room/components/board/roomBoardAgent.ts
//
// The War Room board as a `BoardToolTarget` — how the spatial board's agent
// tools (`features/spatial/tools/useBoardAgentTools.ts`) act on a board that
// keeps its OWN layout model (`boardLayout.ts`) instead of `useBoard`.
//
// Tiles are the thread PARTS (`<threadId>:<tab>`), frames are the THREADS (id =
// the thread id). Every change goes through the same layout path a person's
// drag, throw and Parts menu use, so it is saved to `metadata.spatial_layout`
// exactly like theirs. What a thread-shaped board cannot do is refused with the
// remedy: parts come from the thread (no free tiles), groups ARE threads (no
// regrouping), there are no connections, and the board keeps no undo history
// (each park/removal carries its own Undo toast). One edit is real: `text` on a
// Notes part writes the thread's note through the notes autosave path.
//
// Pure — the host passes its layout, its commit and the Redux-bound bits — so
// it is unit-tested in `__tests__/roomBoardAgent.test.ts`.

import type { Rect } from "@/features/spatial/engine/camera";
import type { BoardTileBase } from "@/features/spatial/board/useBoard";
import type { BoardToolHost, BoardToolTarget, Failure } from "@/features/spatial/tools/useBoardAgentTools";
import type { ThreadTab } from "@/features/war-room/types";
import {
  type BoardLayout,
  type ThreadParts,
  applyPartMoves,
  parsePartKey,
  partKey,
  threadFrame,
  withPartState,
} from "./boardLayout";

export interface RoomPartTile extends BoardTileBase {
  /** "Notes · <thread title>" — the part and the thread it belongs to. */
  title: string;
  threadId: string;
  tab: ThreadTab;
}

export interface RoomBoardAgentDeps {
  /** The arrangement as of the last change (a ref — same-tick tool calls see each other). */
  getLayout: () => BoardLayout;
  /** Replace the arrangement (the host renders and saves it). */
  commit: (next: BoardLayout) => void;
  /** The threads on the board, each with its board tabs. */
  threads: readonly ThreadParts[];
  threadTitle: (threadId: string) => string;
  /** The part's label: "Notes", "Chat", "Project", "Documents"… */
  partLabel: (threadId: string, tab: ThreadTab) => string;
  /** A part was parked (the host shows the person its Undo toast). */
  onParked: (key: string) => void;
  /** Put a part back where it was and show it — the Undo of a removal. */
  restore: (key: string) => void;
  /** Replace the thread's note text; a failure says why it could not. */
  writeNote: (threadId: string, text: string) => Failure | null;
  /** A cheap status word for a part ("recording", "3/5 done"), or null. */
  statusOf: (threadId: string, tab: ThreadTab) => string | null;
}

const fail = (error: string): Failure => ({ ok: false, error });

/** The part's kind, named by its tab — what `board_read` reports. */
export function partKind(tab: ThreadTab): string {
  if (tab.startsWith("entity:")) return "attachments";
  switch (tab) {
    case "agent":
      return "chat";
    case "files":
      return "resources";
    default:
      return tab;
  }
}

export const ROOM_BOARD_REFUSALS = {
  add: (example: string) =>
    `Parts come from the thread — a War Room board holds no free tiles. Add a note in the thread's Notes part instead: board_update_tile on its Notes part (${example}) with \`text\` replaces that thread's note. Files, recordings and chats are added in the thread itself.`,
  update:
    "A War Room part's title and size come from its thread and the room's layout, so they cannot be changed here. Rename the thread from its frame header; move parts with board_move_tiles. On a Notes part, `text` replaces the thread's note.",
  group:
    "On a War Room board, groups are threads — tiles can't be regrouped. Each thread's frame already holds its parts; tidy one thread with board_arrange (its part ids), or move a whole thread with board_move_tiles on its frame id.",
  connect:
    "A War Room board has no connections — every part belongs to its thread's frame. Say how the threads relate in the chat, or write it into a thread's Notes part with board_update_tile.",
  undo:
    "The War Room board keeps no undo history. Each park or removal gave the person an Undo in its toast; to put a part back yourself call board_park with parked:false (it also restores a removed part), or move it back with board_move_tiles.",
  arrange:
    "On a War Room board, board_arrange works on the parts of ONE thread at a time — pass `ids` from a single frame (they share the `<threadId>:` prefix). Threads keep their own frames so frames never overlap; to move a whole thread, move its frame id with board_move_tiles.",
} as const;

export function roomBoardToolHost(
  deps: RoomBoardAgentDeps,
): Omit<BoardToolHost<RoomPartTile>, "store" | "boardTitle"> {
  const { threads } = deps;

  const tileOf = (threadId: string, tab: ThreadTab, rect: Rect): RoomPartTile => ({
    id: partKey(threadId, tab),
    rect,
    title: `${deps.partLabel(threadId, tab)} · ${deps.threadTitle(threadId)}`,
    threadId,
    tab,
  });

  const read = () => {
    const layout = deps.getLayout();
    const parked = new Set(layout.parked);
    const removed = new Set(layout.removed);
    const tiles: RoomPartTile[] = [];
    const onShelf: RoomPartTile[] = [];
    const off: RoomPartTile[] = [];
    const frames: { id: string; title: string; rect: Rect }[] = [];
    for (const t of threads) {
      for (const tab of t.tabs) {
        const key = partKey(t.threadId, tab);
        const rect = layout.parts[key];
        if (!rect) continue;
        const tile = tileOf(t.threadId, tab, rect);
        if (parked.has(key)) onShelf.push(tile);
        else if (removed.has(key)) off.push(tile);
        else tiles.push(tile);
      }
      const frame = threadFrame(t.threadId, t.tabs, layout.parts);
      if (frame) frames.push({ id: t.threadId, title: deps.threadTitle(t.threadId), rect: frame });
    }
    return { tiles, parked: onShelf, removed: off, frames, connections: [] };
  };

  const setState = (key: string, state: "board" | "parked" | "removed") =>
    deps.commit(withPartState(deps.getLayout(), key, state));

  const board: BoardToolTarget<RoomPartTile> = {
    read,
    moveMany: (moves) => {
      const moved = applyPartMoves(deps.getLayout(), threads, moves, deps.threadTitle);
      if (!moved.ok) return moved;
      deps.commit(moved.layout);
      return undefined;
    },
    removeTile: (id) => {
      setState(id, "removed");
      return () => deps.restore(id);
    },
    parkTile: (id) => {
      setState(id, "parked");
      deps.onParked(id);
    },
    unparkTile: (id) => setState(id, "board"),
    checkArrange: (ids) => {
      const owners = new Set(ids.map((id) => parsePartKey(id)?.threadId ?? id));
      return owners.size > 1 ? fail(ROOM_BOARD_REFUSALS.arrange) : null;
    },
    refusals: {
      update: ROOM_BOARD_REFUSALS.update,
      group: ROOM_BOARD_REFUSALS.group,
      connect: ROOM_BOARD_REFUSALS.connect,
      undo: ROOM_BOARD_REFUSALS.undo,
    },
  };

  return {
    board,
    createTile: () => {
      const first = threads[0];
      return fail(ROOM_BOARD_REFUSALS.add(first ? `e.g. "${partKey(first.threadId, "notes")}"` : `"<threadId>:notes"`));
    },
    editTile: (tile, input) => {
      if (tile.tab !== "notes") {
        return fail(
          `"${tile.title}" shows the thread's ${partKind(tile.tab)} live — its content changes in the thread, not from the board. To write something down for this thread, pass \`text\` to its Notes part ("${partKey(tile.threadId, "notes")}").`,
        );
      }
      if (input.text === undefined) {
        return fail("A Notes part holds the thread's note as text — pass `text` (markdown), not `html`.");
      }
      const refused = deps.writeNote(tile.threadId, input.text);
      if (refused) return refused;
      // Written into the note itself (autosaved); nothing on the board changes.
      return {};
    },
    describe: (tile) => ({ kind: partKind(tile.tab), status: deps.statusOf(tile.threadId, tile.tab) }),
  };
}

/**
 * The same, as a hook: the host passes closures over its live layout REF
 * (read only when a tool runs, never during render).
 */
export function useRoomBoardToolHost(
  deps: RoomBoardAgentDeps,
): Omit<BoardToolHost<RoomPartTile>, "store" | "boardTitle"> {
  return roomBoardToolHost(deps);
}
