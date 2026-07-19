import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { getArg, resultAsObject } from "../_shared";
import type { NormalizedHit } from "../knowledge-search/parseRag";

/**
 * Parse + normalize the `document_search` tool result onto the SAME
 * `NormalizedHit` shape `knowledge_search` uses, so both tools render through the
 * one canonical `RagSourceCard` / `RagHitCard` stack and never drift.
 *
 * Wire shape (aidream): { scope, mode, scanned_document_ids, by_page: [
 *   { document_id, page_number, semantic: [{ snippet, score, chunk_id,
 *     page_numbers, derivation_kind, ... }], string: [...] } ], note }.
 * Hits are flattened across pages, deduped by chunk_id (a chunk can match on
 * several pages), and sorted by score. `source_kind: "library_doc"` routes a
 * click to the canonical /rag/viewer at the chunk + page.
 */

interface RawDocHit {
  document_id?: string;
  chunk_id?: string;
  snippet?: string;
  score?: number;
  page_numbers?: number[];
  derivation_kind?: string;
}

interface RawByPage {
  document_id?: string;
  page_number?: number;
  semantic?: RawDocHit[];
  string?: RawDocHit[];
}

export interface ParsedDocumentSearch {
  query: string | null;
  scope: string | null;
  hits: NormalizedHit[];
  pageCount: number;
  isError: boolean;
  errorMessage: string | null;
}

export function parseDocumentSearch(
  entry: ToolLifecycleEntry,
): ParsedDocumentSearch {
  const query = getArg<string>(entry, "query") ?? null;
  const scope = getArg<string>(entry, "scope") ?? null;

  if (entry.status === "error") {
    return {
      query,
      scope,
      hits: [],
      pageCount: 0,
      isError: true,
      errorMessage: entry.errorMessage ?? null,
    };
  }

  const result = resultAsObject(entry);
  const byPage = Array.isArray(result?.by_page)
    ? (result.by_page as RawByPage[])
    : [];

  const seen = new Set<string>();
  const hits: NormalizedHit[] = [];
  const pages = new Set<number>();

  for (const page of byPage) {
    if (typeof page.page_number === "number") pages.add(page.page_number);
    const raws = [...(page.semantic ?? []), ...(page.string ?? [])];
    for (const raw of raws) {
      const snippet = typeof raw.snippet === "string" ? raw.snippet : "";
      if (!snippet) continue;
      const chunkId =
        raw.chunk_id ?? `${page.document_id ?? "doc"}:${page.page_number}`;
      if (seen.has(chunkId)) continue;
      seen.add(chunkId);
      const pageNumber =
        raw.page_numbers?.[0] ??
        (typeof page.page_number === "number" ? page.page_number : null);
      hits.push({
        rank: hits.length + 1,
        chunk_id: chunkId,
        source_kind: "library_doc",
        source_id: raw.document_id ?? page.document_id ?? "",
        snippet,
        score: typeof raw.score === "number" ? raw.score : 0,
        file_name: null,
        page_number: pageNumber,
        vector_rank: null,
        lexical_rank: null,
        rerank_score: null,
        entity_rank: null,
        entities: [],
        metadata: raw.derivation_kind
          ? { derivation_kind: raw.derivation_kind }
          : {},
      });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  hits.forEach((h, i) => {
    h.rank = i + 1;
  });

  return {
    query,
    scope,
    hits,
    pageCount: pages.size,
    isError: false,
    errorMessage: null,
  };
}
