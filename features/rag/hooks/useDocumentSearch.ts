"use client";

/**
 * useDocumentSearch — in-document search state for the library viewer.
 *
 * Owns the search a user runs *against a single processed document*: the
 * query, the submitted/active query (what's currently highlighted), the
 * server's ranked lexical hits, and a derived summary (which pages matched,
 * how many segments, the best snippet).
 *
 * Why server lexical + client highlight:
 *   - The backend `…/test-search` runs Postgres full-text search over the
 *     doc's chunks and returns ranked hits with `page_numbers`. That is the
 *     only way to know *where across the whole document* the term appears
 *     without fetching every page — so it powers the cross-page summary.
 *   - The actual highlighting of the rendered page text is literal
 *     (`computeMatches`) so it marks exactly what the user typed.
 *
 * This is lifted to the viewer (rather than living inside one panel) so the
 * same query drives the page-text highlights, the summary banner, the
 * per-page match stepper, and the ranked results list at once.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { postJson } from "@/lib/python-client";

export interface DocSearchHit {
  chunk_id: string;
  chunk_index: number | null;
  score: number;
  page_numbers: number[] | null;
  section_kind: string | null;
  content_text: string;
}

interface ApiTestSearchResponse {
  document_id: string;
  query: string;
  hits: DocSearchHit[];
  total_chunks_in_doc: number;
}

export interface DocSearchSummary {
  /** Sorted, unique 1-based page numbers that contain at least one hit. */
  matchedPages: number[];
  /** page number → number of matching segments on that page. */
  pageHitCounts: Record<number, number>;
  /** Number of matching segments (chunks) overall. */
  segmentCount: number;
  /** Total chunks in the document (denominator for "X of Y matched"). */
  totalChunks: number;
  /** Highest-ranked hit, for the "best match" preview in the summary. */
  topHit: DocSearchHit | null;
}

export interface UseDocumentSearch {
  query: string;
  setQuery: (q: string) => void;
  /** The submitted query currently highlighted/summarized. "" until first run. */
  activeQuery: string;
  hits: DocSearchHit[] | null;
  summary: DocSearchSummary | null;
  loading: boolean;
  error: string | null;
  hasSearched: boolean;
  /** Bumps once per completed search — consumers key "jump to first match". */
  resultNonce: number;
  /** Runs the search; resolves with the sorted matched page numbers so the
   *  caller can jump to the first one without a reactive effect. */
  run: (raw?: string) => Promise<number[]>;
  clear: () => void;
}

const RESULT_LIMIT = 50;

export function useDocumentSearch(documentId: string): UseDocumentSearch {
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [hits, setHits] = useState<DocSearchHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultNonce, setResultNonce] = useState(0);

  // Guards against a slow earlier request overwriting a newer one.
  const seqRef = useRef(0);

  const run = useCallback(
    async (raw?: string): Promise<number[]> => {
      const q = (raw ?? query).trim();
      if (!q) return [];
      const seq = ++seqRef.current;
      setActiveQuery(q);
      setQuery(q);
      setLoading(true);
      setError(null);
      setHits(null);
      try {
        const { data } = await postJson<
          ApiTestSearchResponse,
          { query: string; limit: number }
        >(`/rag/library/${documentId}/test-search`, {
          query: q,
          limit: RESULT_LIMIT,
        });
        if (seq !== seqRef.current) return [];
        const newHits = Array.isArray(data?.hits) ? data.hits : [];
        setHits(newHits);
        setTotal(
          typeof data?.total_chunks_in_doc === "number"
            ? data.total_chunks_in_doc
            : 0,
        );
        setResultNonce((n) => n + 1);
        return Array.from(
          new Set(newHits.flatMap((h) => h.page_numbers ?? [])),
        ).sort((a, b) => a - b);
      } catch (e) {
        if (seq !== seqRef.current) return [];
        setError(e instanceof Error ? e.message : "Search failed");
        return [];
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    },
    [documentId, query],
  );

  const clear = useCallback(() => {
    seqRef.current++;
    setQuery("");
    setActiveQuery("");
    setHits(null);
    setError(null);
    setTotal(0);
    setLoading(false);
  }, []);

  const summary = useMemo<DocSearchSummary | null>(() => {
    if (!hits) return null;
    const pageHitCounts: Record<number, number> = {};
    for (const h of hits) {
      for (const p of h.page_numbers ?? []) {
        pageHitCounts[p] = (pageHitCounts[p] ?? 0) + 1;
      }
    }
    const matchedPages = Object.keys(pageHitCounts)
      .map(Number)
      .sort((a, b) => a - b);
    return {
      matchedPages,
      pageHitCounts,
      segmentCount: hits.length,
      totalChunks: total,
      topHit: hits[0] ?? null,
    };
  }, [hits, total]);

  return {
    query,
    setQuery,
    activeQuery,
    hits,
    summary,
    loading,
    error,
    hasSearched: activeQuery.length > 0,
    resultNonce,
    run,
    clear,
  };
}
