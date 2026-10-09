/**
 * ONE connector model: a connection between two tiles IS an arrow shape whose two ends are bound to
 * those tiles (`bind.start` = from, `bind.end` = to). It is selected, restyled, deleted and followed
 * like every other connector. This module is the only place that translates between the two words:
 *
 *   - `connectionToArrow`  a legacy stored edge / an agent's `board_connect` -> the bound arrow;
 *   - `connectionsOf`      the arrows that join two TILES, read back as `BoardConnection`s (what chat
 *                          context, the chat tile's chips and `board_read` mean by "a line").
 *
 * A saved board's old `edges[]` column is migrated on load (`board/document.ts`): same id, same ends.
 */

import type { Rect } from "../engine/camera";
import type { BoardShape } from "../engine/shapes";

/** A line between two tiles, as the rest of the board reads it. */
export interface TileConnection {
  id: string;
  from: string;
  to: string;
}

const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** The bound arrow for a connection. `rectOf` gives the tiles' rects (the arrow's stored ends; the live ends follow the tiles). */
export function connectionToArrow(c: TileConnection, rectOf: (tileId: string) => Rect | undefined): BoardShape | null {
  const a = rectOf(c.from);
  const b = rectOf(c.to);
  if (!a || !b || c.from === c.to) return null;
  return { id: c.id, kind: "arrow", points: [centre(a), centre(b)], bind: { start: c.from, end: c.to } };
}

/** The arrows that join two different tiles, in drawing order. */
export function connectionsOf(shapes: readonly BoardShape[], isTile: (id: string) => boolean): TileConnection[] {
  const out: TileConnection[] = [];
  for (const s of shapes) {
    if (s.kind !== "arrow") continue;
    const from = s.bind?.start;
    const to = s.bind?.end;
    if (from && to && from !== to && isTile(from) && isTile(to)) out.push({ id: s.id, from, to });
  }
  return out;
}

/** The same list again when nothing about it changed (a stable reference for layout subscribers). */
export function sameConnections(a: readonly TileConnection[], b: readonly TileConnection[]): boolean {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id && x.from === b[i].from && x.to === b[i].to);
}
