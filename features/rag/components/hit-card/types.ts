/**
 * RagHitView — the ONE normalized shape the canonical RAG hit card renders.
 *
 * Every RAG surface speaks a slightly different hit type (the `rag_search`
 * tool's `NormalizedHit`, the search API's `RagSearchHit`, the diagnose lab's
 * `DiagnoseHit`). Rather than fork a card per shape, each is adapted to this
 * one view (see `adapters.ts`) and rendered by the single `RagHitCard`.
 */

export interface RagHitView {
  sourceKind: string;
  /** cld_file → file_id; library_doc → processed_document_id; note → note id;
   *  transcript → session id; scraped → the page URL; else opaque. */
  sourceId: string;
  chunkId: string;
  /** Display name — best-effort from the hit; a caller with a Redux-resolved
   *  name passes it as the adapter's `name` override. */
  title: string | null;
  pageNumber: number | null;
  pageNumbers: number[] | null;
  score: number;
  snippet: string;
  vectorRank: number | null;
  lexicalRank: number | null;
  rerankScore: number | null;
  entityRank: number | null;
  entities: string[];
  /** Curated-library short code (e.g. "AMA5"), when the hit is a library doc. */
  libraryShortCode: string | null;
}

/** A hit that reached the results purely via KG entity co-occurrence — no
 *  semantic (vector) or keyword (lexical) match. Worth flagging on every
 *  surface: it's the classic "a 3-word title outranks real content" case. */
export function isEntityOnly(view: RagHitView): boolean {
  return (
    view.vectorRank === null &&
    view.lexicalRank === null &&
    view.entityRank !== null
  );
}
