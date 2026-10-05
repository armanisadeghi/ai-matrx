/**
 * What an add puts on a board — the dedup half of UserBoard's `place()`, the
 * ONE path every way in (Add menu, picker, drop, paste, agents) ends in.
 *
 * A record already on the board is shown, never opened a second time (two
 * editors of one record in one tab overwrite each other); the same record twice
 * in one add is placed once. Returns the tiles to place and, per wanted item,
 * the tile that will show it (`already`: it was on the board before), or null
 * for a repeat within the add.
 */

import type { BoardItemType, PlacedItem } from "../items/types";
import { type NodeSource, recordKeyOf } from "./document";

export interface PlannedTile {
  id: string;
  title: string;
  source: NodeSource;
  rect: { x: number; y: number; w: number; h: number };
}

export type PlacementResult = { id: string; already: boolean } | null;

export function planPlacement(
  wanted: readonly PlacedItem[],
  onBoardTiles: readonly { id: string; source: NodeSource }[],
  itemTypeFor: (source: NodeSource) => BoardItemType | null,
  newId: () => string = () => crypto.randomUUID().slice(0, 8),
): { tiles: PlannedTile[]; results: PlacementResult[]; already: string[] } {
  const onBoard = new Map<string, string>();
  for (const t of onBoardTiles) {
    const key = recordKeyOf(t.source);
    if (key) onBoard.set(key, t.id);
  }
  const already: string[] = [];
  const seen = new Set<string>();
  const results: PlacementResult[] = [];
  const tiles: PlannedTile[] = [];
  for (const item of wanted) {
    const key = recordKeyOf(item.source);
    if (key && seen.has(key)) {
      results.push(null);
      continue;
    }
    if (key) seen.add(key);
    const existing = key ? onBoard.get(key) : undefined;
    if (existing) {
      already.push(existing);
      results.push({ id: existing, already: true });
      continue;
    }
    const type = itemTypeFor(item.source);
    const size = item.size ?? type?.defaultSize ?? { w: 480, h: 360 };
    const id = `${type?.key ?? "item"}:${newId()}`;
    tiles.push({ id, title: item.title, source: item.source, rect: { x: 0, y: 0, ...size } });
    results.push({ id, already: false });
  }
  return { tiles, results, already };
}
