// features/esign/editor/merge.ts — three-way merge of two edits of one draft, by item id (CONTRACT §15).
// Documents, recipients, fields and groups are keyed; scalar settings: mine wins. A change to the
// SAME item by both sides is a conflict the sender resolves ("Keep mine / Take theirs") — never a
// silent discard. Fully typed against the contract (verify B2: no casts).

import type { DraftField, DraftGroup, DraftRecipient, EnvelopeDraftV1 } from "../contract/draft";

type ItemOf = {
  documents: EnvelopeDraftV1["documents"][number];
  recipients: DraftRecipient;
  fields: DraftField;
  groups: DraftGroup;
};
type ArrayKey = keyof ItemOf;

export type DraftConflict = {
  [K in ArrayKey]: {
    array: K;
    id: string;
    /** The server's copy of the item (null = they deleted it). */
    theirs: ItemOf[K] | null;
    /** What it is, for the sentence. */
    label: string;
  };
}[ArrayKey];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const ID: { [K in ArrayKey]: (x: ItemOf[K]) => string } = {
  documents: (x) => x.key,
  recipients: (x) => x.key,
  fields: (x) => x.id,
  groups: (x) => x.id,
};
const LABEL: { [K in ArrayKey]: (x: ItemOf[K]) => string } = {
  documents: (x) => x.name || "A document",
  recipients: (x) => x.full_name || x.email || "A recipient",
  fields: (x) => x.label || "A field",
  groups: (x) => x.label || "A group",
};

/** Per key of an object: mine when I changed it, else theirs. */
function mergeObject<T extends object>(base: T, mine: T, theirs: T): T {
  const out = { ...theirs };
  for (const k of Object.keys({ ...theirs, ...mine }) as (keyof T)[]) {
    out[k] = same(mine[k], base[k]) ? theirs[k] : mine[k];
  }
  return out;
}

function mergeList<K extends ArrayKey>(
  array: K,
  base: readonly ItemOf[K][],
  mine: readonly ItemOf[K][],
  theirs: readonly ItemOf[K][],
  onConflict: (id: string, theirs: ItemOf[K] | null, label: string) => void,
): ItemOf[K][] {
  const idOf: (x: ItemOf[K]) => string = ID[array];
  const labelOf: (x: ItemOf[K]) => string = LABEL[array];
  const pick = (list: readonly ItemOf[K][]) => new Map(list.map((x) => [idOf(x), x] as const));
  const b = pick(base);
  const m = pick(mine);
  const t = pick(theirs);
  const out: ItemOf[K][] = [];
  const seen = new Set<string>();
  // Their order first, then what only I have.
  for (const itemId of [...t.keys(), ...m.keys()]) {
    if (seen.has(itemId)) continue;
    seen.add(itemId);
    const bi = b.get(itemId);
    const mi = m.get(itemId);
    const ti = t.get(itemId);
    let take: ItemOf[K] | undefined;
    if (same(mi, bi)) take = ti; // I did not touch it: their version (or their delete)
    else if (same(ti, bi)) take = mi; // they did not touch it: mine
    else if (same(mi, ti)) take = mi;
    else {
      take = mi; // both changed: keep mine until the sender says otherwise
      const shown = mi ?? ti;
      onConflict(itemId, ti ?? null, shown ? labelOf(shown) : "An item");
    }
    if (take !== undefined) out.push(take);
  }
  return out;
}

export function mergeDrafts(
  base: EnvelopeDraftV1,
  mine: EnvelopeDraftV1,
  theirs: EnvelopeDraftV1,
): { merged: EnvelopeDraftV1; conflicts: DraftConflict[] } {
  const conflicts: DraftConflict[] = [];
  const merged: EnvelopeDraftV1 = {
    schema_version: 1,
    title: same(mine.title, base.title) ? theirs.title : mine.title,
    email_subject: same(mine.email_subject, base.email_subject) ? theirs.email_subject : mine.email_subject,
    message: same(mine.message, base.message) ? theirs.message : mine.message,
    settings: mergeObject(base.settings, mine.settings, theirs.settings),
    documents: mergeList("documents", base.documents, mine.documents, theirs.documents, (id, t, label) => conflicts.push({ array: "documents", id, theirs: t, label })),
    recipients: mergeList("recipients", base.recipients, mine.recipients, theirs.recipients, (id, t, label) => conflicts.push({ array: "recipients", id, theirs: t, label })),
    fields: mergeList("fields", base.fields, mine.fields, theirs.fields, (id, t, label) => conflicts.push({ array: "fields", id, theirs: t, label })),
    groups: mergeList("groups", base.groups, mine.groups, theirs.groups, (id, t, label) => conflicts.push({ array: "groups", id, theirs: t, label })),
  };
  return { merged, conflicts };
}

function putBack<K extends ArrayKey>(list: readonly ItemOf[K][], array: K, id: string, theirs: ItemOf[K] | null): ItemOf[K][] {
  const idOf: (x: ItemOf[K]) => string = ID[array];
  const next = [...list];
  const at = next.findIndex((x) => idOf(x) === id);
  if (theirs === null) {
    if (at >= 0) next.splice(at, 1);
  } else if (at >= 0) next[at] = theirs;
  else next.push(theirs);
  return next;
}

/** "Take theirs" for the conflicted items: put the server's copy back (or delete). */
export function takeTheirs(draft: EnvelopeDraftV1, conflicts: readonly DraftConflict[]): EnvelopeDraftV1 {
  let next = draft;
  for (const c of conflicts) {
    if (c.array === "documents") next = { ...next, documents: putBack(next.documents, "documents", c.id, c.theirs) };
    else if (c.array === "recipients") next = { ...next, recipients: putBack(next.recipients, "recipients", c.id, c.theirs) };
    else if (c.array === "fields") next = { ...next, fields: putBack(next.fields, "fields", c.id, c.theirs) };
    else next = { ...next, groups: putBack(next.groups, "groups", c.id, c.theirs) };
  }
  return next;
}
