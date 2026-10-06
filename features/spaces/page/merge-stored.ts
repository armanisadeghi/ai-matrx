// features/spaces/page/merge-stored.ts — a stored version the room did not write (a block moved here from
// another page, a restore, any writer outside the live room) is merged INTO the room before the host's
// next save, never overwritten by it. Three-way on block ids:
//   base     — the ids of the last stored version this member knew (its own save or one it learned);
//   room     — what the open page holds now (every live edit);
//   incoming — the newer stored version.
// A block the outside writer ADDED (in incoming, never in base, not in the room) goes in after the stored
// block it follows; a block the outside writer REMOVED (in base and the room, gone from incoming) comes
// out. A block the room deleted (in base, not in the room) is never resurrected; a block the room added
// (not in base) is never removed.

import type { SpaceBlock } from "../contract";

interface Tree {
  id: string;
  children?: Tree[];
}

/** Every block id in a tree, at any depth (columns, toggles, nested lists). */
export function blockIds(blocks: readonly Tree[] | undefined, into: Set<string> = new Set()): Set<string> {
  for (const b of blocks ?? []) {
    if (b.id) into.add(b.id);
    if (b.children?.length) blockIds(b.children, into);
  }
  return into;
}

export interface StoredMerge {
  /** Room blocks the outside writer removed. */
  remove: string[];
  /** Top-level blocks the outside writer added, each after the room block it follows (null = first). */
  insert: Array<{ block: SpaceBlock; after: string | null }>;
}

export function planStoredMerge(base: ReadonlySet<string>, room: readonly Tree[], incoming: readonly SpaceBlock[]): StoredMerge {
  const inRoom = blockIds(room);
  const inIncoming = blockIds(incoming);
  const remove = [...inRoom].filter((id) => base.has(id) && !inIncoming.has(id));
  const gone = new Set(remove);
  const insert: StoredMerge["insert"] = [];
  // The anchor walks the stored order: the last stored top-level block the room still holds (or one just
  // inserted), so a run of added blocks keeps its order.
  let after: string | null = null;
  for (const blk of incoming) {
    if (!base.has(blk.id) && !inRoom.has(blk.id)) {
      insert.push({ block: blk, after });
      after = blk.id;
    } else if (inRoom.has(blk.id) && !gone.has(blk.id) && room.some((r) => r.id === blk.id)) {
      after = blk.id;
    }
  }
  return { remove, insert };
}
