/**
 * THE `seo.collection_run` ROW'S ENTITY + READABLE CONTENT — one definition,
 * shared by every surface that names a collection run (every SEO command —
 * competitor autopsy, AI visibility, page audit, robots/structured-data
 * checks — persists through this one table).
 *
 * Today: `CompetitorAutopsyWorkspace` (history tab). `CollectionRunView`
 * (the standalone share-page render of a single run) and `RunHistoryPanel`
 * (the merged scheduler-run + collection-run execution list) show the same
 * identity and are future adopters — see the registry note in
 * `features/context-menu-v3/SECTIONS.md`.
 *
 * No shared row-actions hook here (yet): the only consumer's table has no
 * per-row action set to converge, so this stays the identity's entity ref +
 * readable text — the same primitives `ShareButton resourceType="seo_collection_run"`
 * already uses elsewhere. Grow this into a full menu-section hook (mirroring
 * `useCrmRowMenu`) the day a second row-actions table adopts it.
 */

import type { ContextMenuEntityRef } from "@/features/context-menu-v3/types";

export interface CollectionRunLike {
  id: string;
  operation: string;
  provider: string;
  status: string;
  target_ref: string;
  started_at: string | null;
  completed_at: string | null;
}

export function collectionRunEntityRef(
  row: CollectionRunLike | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return {
    type: "seo_collection_run",
    id: row.id,
    title: `${row.operation} (${row.provider})`,
  };
}

export function collectionRunContent(row: CollectionRunLike): string {
  return [
    `${row.operation} — ${row.provider} — ${row.target_ref}`,
    `status=${row.status}`,
    row.started_at ? `started: ${row.started_at}` : null,
    row.completed_at ? `completed: ${row.completed_at}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
