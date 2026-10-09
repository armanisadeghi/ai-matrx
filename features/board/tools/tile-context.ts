/**
 * A CHAT TILE'S OWN CONTEXT — lines are context (Arman, 2026-10-08).
 *
 * A line drawn between a tile and a chat tile (either direction) hands the chat that tile's FULL
 * surface values, the same rich values a selected or live tile gets, and the chat also receives
 * the normal overview of everything else on the board. It is computed FOR the asking tile: two chat
 * tiles with different lines see different connected sets. The sidebar board chat is unaffected
 * (it reads the board surface, `BoardSurface`, which knows nothing of lines).
 *
 * One mechanism: `boardItemsOverview` (the same fair-share overview the board publishes) with the
 * connected rows marked, delivered as the chat column's one named context entry (`getCanvasContext`,
 * `CanvasChatColumn`), refreshed the way that column refreshes every canvas entry.
 */

import type { BoardConnection } from "../board/board-store";
import type { BoardTileBase } from "../board/useBoard";
import {
  boardItemsOverview,
  type BoardItemRow,
  type BoardItemsOverview,
  type ItemSurfaceIndex,
  type StoredBasics,
} from "./item-surfaces";

/** The key of the one context entry a chat tile carries its lines in. */
export const CONNECTED_CONTEXT_KEY = "board_connected_context";

/** Every tile joined to `tileId` by a line, in either direction, in line order, once each. */
export function connectedTileIds(connections: readonly BoardConnection[], tileId: string): string[] {
  const out: string[] = [];
  for (const c of connections) {
    const other = c.from === tileId ? c.to : c.to === tileId ? c.from : null;
    if (other && other !== tileId && !out.includes(other)) out.push(other);
  }
  return out;
}

/** What the builder needs from a board host — a subset of `BoardToolHost`. */
export interface TileContextHost<T extends BoardTileBase & { title: string }> {
  board: {
    read: () => { tiles: T[]; parked: T[]; removed?: T[]; connections: readonly BoardConnection[] };
  };
  describe: (tile: T) => { kind: string; surface?: string | null };
  itemSurfaces?: ItemSurfaceIndex;
  storedBasics?: (tile: T) => StoredBasics | null;
}

export interface TileContextEntry {
  key: string;
  type: "json";
  label: string;
  value: {
    note: string;
    connected_ids: string[];
    board_items: BoardItemsOverview;
  };
}

/**
 * The context entry for ONE chat tile, or null when no line touches it (the chat then carries no
 * board entry at all). `connected: true` rows carry `full_values`; every other row is the board's
 * normal fair-share basics.
 */
export async function buildTileContext<T extends BoardTileBase & { title: string }>(
  tileId: string,
  host: TileContextHost<T>,
): Promise<TileContextEntry | null> {
  const now = host.board.read();
  const connectedIds = connectedTileIds(now.connections, tileId);
  if (connectedIds.length === 0) return null;
  const connected = new Set(connectedIds);
  const parked = new Set(now.parked.map((t) => t.id));
  const removedTiles = now.removed ?? [];
  const removed = new Set(removedTiles.map((t) => t.id));
  const rows: BoardItemRow[] = [...now.tiles, ...now.parked, ...removedTiles]
    // The asking chat is not an item of its own context.
    .filter((t) => t.id !== tileId)
    .map((t) => {
      const described = host.describe(t);
      return {
        id: t.id,
        title: t.title,
        kind: described.kind,
        surface: described.surface ?? null,
        live: false,
        stored_basics: host.storedBasics?.(t) ?? null,
        ...(connected.has(t.id) ? { connected: true } : {}),
        ...(parked.has(t.id) ? { parked: true } : {}),
        ...(removed.has(t.id) ? { removed: true } : {}),
      };
    })
    // Connected sources lead, so they are never the ones cut by the listing cap.
    .sort((a, b) => Number(!!b.connected) - Number(!!a.connected));
  const overview = await boardItemsOverview(rows, host.itemSurfaces ?? null);
  return {
    key: CONNECTED_CONTEXT_KEY,
    type: "json",
    label: "Sources connected to this chat",
    value: {
      note:
        "The person drew lines from these board items into this chat. Items marked `connected` carry `full_values`: " +
        "their whole content as it is right now. Answer questions about 'the connected note/page/table' from them. " +
        "Every other item is listed with a few basics only.",
      connected_ids: connectedIds,
      board_items: overview,
    },
  };
}
