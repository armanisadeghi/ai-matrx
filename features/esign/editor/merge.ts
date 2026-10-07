// features/esign/editor/merge.ts — three-way merge of two edits of one draft, by item id (CONTRACT §15).
// Documents, recipients, fields and groups are keyed; scalar settings: mine wins. A change to the
// SAME item by both sides is a conflict the sender resolves ("Keep mine / Take theirs") — never a
// silent discard.

import type { EnvelopeDraftV1 } from "../contract/draft";

type ArrayKey = "documents" | "recipients" | "fields" | "groups";
const ARRAYS: { key: ArrayKey; id: (x: never) => string }[] = [
  { key: "documents", id: (x: { key: string }) => x.key },
  { key: "recipients", id: (x: { key: string }) => x.key },
  { key: "fields", id: (x: { id: string }) => x.id },
  { key: "groups", id: (x: { id: string }) => x.id },
] as never;

export interface DraftConflict {
  array: ArrayKey;
  id: string;
  /** The server's copy of the item (null = they deleted it). */
  theirs: unknown;
  /** What it is, for the sentence. */
  label: string;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function labelOf(array: ArrayKey, item: unknown): string {
  const o = (item ?? {}) as Record<string, unknown>;
  if (array === "fields") return String(o.label ?? "A field");
  if (array === "recipients") return String(o.full_name || o.email || "A recipient");
  if (array === "documents") return String(o.name ?? "A document");
  return String(o.label ?? "A group");
}

export function mergeDrafts(
  base: EnvelopeDraftV1,
  mine: EnvelopeDraftV1,
  theirs: EnvelopeDraftV1,
): { merged: EnvelopeDraftV1; conflicts: DraftConflict[] } {
  const conflicts: DraftConflict[] = [];
  const merged: Record<string, unknown> = { schema_version: 1 };

  // Scalars: mine wins when I changed it, else theirs.
  for (const k of ["title", "email_subject", "message"] as const) {
    merged[k] = same(mine[k], base[k]) ? theirs[k] : mine[k];
  }
  const settings: Record<string, unknown> = {};
  for (const k of Object.keys({ ...theirs.settings, ...mine.settings }) as (keyof EnvelopeDraftV1["settings"])[]) {
    settings[k] = same(mine.settings[k], base.settings[k]) ? theirs.settings[k] : mine.settings[k];
  }
  merged.settings = settings;

  for (const { key, id } of ARRAYS) {
    const pick = (list: unknown[]) => new Map(list.map((x) => [id(x as never), x]));
    const b = pick(base[key] as unknown[]);
    const m = pick(mine[key] as unknown[]);
    const t = pick(theirs[key] as unknown[]);
    const out: unknown[] = [];
    const seen = new Set<string>();
    // Their order first, then what only I have.
    const order = [...t.keys(), ...m.keys()];
    for (const itemId of order) {
      if (seen.has(itemId)) continue;
      seen.add(itemId);
      const bi = b.get(itemId);
      const mi = m.get(itemId);
      const ti = t.get(itemId);
      let take: unknown;
      if (same(mi, bi)) take = ti; // I did not touch it: their version (or their delete)
      else if (same(ti, bi)) take = mi; // they did not touch it: mine
      else if (same(mi, ti)) take = mi;
      else {
        take = mi; // both changed: keep mine until the sender says otherwise
        conflicts.push({ array: key, id: itemId, theirs: ti ?? null, label: labelOf(key, mi ?? ti) });
      }
      if (take !== undefined) out.push(take);
    }
    merged[key] = out;
  }
  return { merged: merged as unknown as EnvelopeDraftV1, conflicts };
}

/** "Take theirs" for the conflicted items: put the server's copy back (or delete). */
export function takeTheirs(draft: EnvelopeDraftV1, conflicts: readonly DraftConflict[]): EnvelopeDraftV1 {
  const next = { ...draft } as Record<ArrayKey, unknown[]> & EnvelopeDraftV1;
  const idOf = (array: ArrayKey, x: unknown) =>
    array === "documents" || array === "recipients" ? (x as { key: string }).key : (x as { id: string }).id;
  for (const c of conflicts) {
    const list = [...(next[c.array] as unknown[])];
    const at = list.findIndex((x) => idOf(c.array, x) === c.id);
    if (c.theirs === null) {
      if (at >= 0) list.splice(at, 1);
    } else if (at >= 0) list[at] = c.theirs;
    else list.push(c.theirs);
    (next as Record<string, unknown>)[c.array] = list;
  }
  return next as EnvelopeDraftV1;
}
