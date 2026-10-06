// features/spaces/page/trash-state.ts — is the open page in Trash, by the sidebar's list?
//
// A page moved to Trash from the sidebar (its own row, or an ancestor's) while it is open must show
// "This page is in Trash" at once (Notion), not only after the page itself is re-read. The list knows:
// the page or one of its ancestors is among the archived entries.

type Entry = { id: string; parentId: string | null };

export function trashedByList(docId: string, docParentId: string | null, archived: readonly Entry[], known: ReadonlyMap<string, Entry>): boolean {
  const archivedIds = new Set(archived.map((a) => a.id));
  if (archivedIds.has(docId)) return true;
  const parentOf = new Map<string, string | null>();
  for (const a of archived) parentOf.set(a.id, a.parentId);
  for (const [id, s] of known) parentOf.set(id, s.parentId);
  const seen = new Set<string>();
  let p = docParentId;
  while (p && !seen.has(p)) {
    if (archivedIds.has(p)) return true;
    seen.add(p);
    p = parentOf.get(p) ?? null;
  }
  return false;
}
