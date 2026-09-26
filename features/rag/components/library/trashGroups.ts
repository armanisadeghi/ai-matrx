/**
 * features/rag/components/library/trashGroups.ts
 *
 * The trash shows one item per SOURCE, never one per version: a Source's
 * versions (captures, recaptures, a person's edits) share `source_id`, and
 * trashing or restoring any of them moves the whole chain. A file's cascade
 * family is its own item (it restores through the file).
 */

import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";

export interface TrashRow {
  id: string;
  name: string | null;
  source_kind: string;
  source_id: string;
  derivation_kind: string;
  total_pages: number | null;
  deleted_at: string;
  deleted_via: string | null;
  file_name: string | null;
  hidden_chunks: number;
}

export interface TrashGroup {
  key: string;
  /** The row the item is named by and acted on: the newest capture, never an edit. */
  head: TrashRow;
  /** Every version's id (purge removes each). */
  ids: string[];
  versions: number;
  hiddenChunks: number;
}

const CAPTURE_RANK: Record<string, number> = { recapture: 2, initial_extract: 1 };

export function groupTrashRows(rows: readonly TrashRow[]): TrashGroup[] {
  const groups = new Map<string, TrashRow[]>();
  for (const r of rows) {
    const key = `${r.deleted_via ?? "doc"}:${r.source_id}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.entries()].map(([key, members]) => {
    let head = members[0];
    for (const m of members) {
      const rank = CAPTURE_RANK[m.derivation_kind] ?? (m.derivation_kind === "manual_curation" ? -1 : 0);
      const headRank =
        CAPTURE_RANK[head.derivation_kind] ?? (head.derivation_kind === "manual_curation" ? -1 : 0);
      if (rank >= headRank) head = m;
    }
    return {
      key,
      head,
      ids: members.map((m) => m.id),
      versions: members.length,
      hiddenChunks: members.reduce((n, m) => n + (m.hidden_chunks || 0), 0),
    };
  });
}

/** "1 segment" / "12 segments". */
export function piecesWords(n: number): string {
  return `${n} ${(n === 1 ? RAG_VOCAB.segmentShort : RAG_VOCAB.segmentsShort).toLowerCase()}`;
}
