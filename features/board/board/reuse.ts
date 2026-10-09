/**
 * REUSED ITEMS (SI-13) — one record shown live on many boards. A tile stores a reference, never a copy
 * (`NodeSource`), so the same note, document or file on two boards is already ONE item; this module only
 * answers "which other boards hold it?" from the saved boards' stored nodes (`recordKeyOf` is the identity).
 * Pure: the caller reads every board once (`listBoardRefs`), never one query per tile.
 */

import { recordKeyOf, type NodeSource } from "./document";

export interface BoardRef {
  id: string;
  title: string;
}

export type ReuseIndex = ReadonlyMap<string, readonly BoardRef[]>;

/** The `source` of a stored node when it is a tile (not a frame or a drawn shape) with a readable source. */
function tileSource(node: unknown): NodeSource | null {
  if (typeof node !== "object" || node === null) return null;
  const n = node as { group?: unknown; shape?: unknown; source?: unknown };
  if (n.group === true || n.shape === true) return null;
  const s = n.source as { kind?: unknown } | undefined;
  return s && typeof s === "object" && typeof s.kind === "string" ? (s as NodeSource) : null;
}

/** Record key → the boards that hold it (each board once per key), from every board's stored `nodes`. */
export function buildReuseIndex(boards: readonly { id: string; title: string; nodes: unknown }[]): ReuseIndex {
  const index = new Map<string, BoardRef[]>();
  for (const b of boards) {
    if (!Array.isArray(b.nodes)) continue;
    const seen = new Set<string>();
    for (const node of b.nodes) {
      const source = tileSource(node);
      const key = source ? recordKeyOf(source) : null;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const list = index.get(key);
      if (list) list.push({ id: b.id, title: b.title });
      else index.set(key, [{ id: b.id, title: b.title }]);
    }
  }
  return index;
}

/** The OTHER boards that hold this tile's record (empty for board-only content or a record on one board). */
export function otherBoardsOf(index: ReuseIndex, source: NodeSource, currentBoardId: string | null): readonly BoardRef[] {
  const key = recordKeyOf(source);
  if (!key) return [];
  return (index.get(key) ?? []).filter((b) => b.id !== currentBoardId);
}
