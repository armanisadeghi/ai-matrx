"use client";

/**
 * The Sources behind one page of Knowledge search results, read in ONE batch
 * (direct Supabase read under RLS — the same `docproc.processed_documents` row
 * the Sources page lists), keyed by processed_document_id. A failed read is
 * returned as `error` so the page can say it, never swallowed.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import {
  SEARCH_HIT_SOURCE_COLUMNS,
  type SearchHitSourceRow,
} from "@/features/rag/search-hit-source";

export function useSearchHitSources(documentIds: readonly string[]): {
  rows: Map<string, SearchHitSourceRow>;
  loading: boolean;
  error: string | null;
} {
  const key = [...new Set(documentIds)].sort().join(",");
  const [state, setState] = useState<{
    key: string;
    rows: Map<string, SearchHitSourceRow>;
    error: string | null;
  }>({ key: "", rows: new Map(), error: null });

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    void supabase
      .schema("docproc")
      .from("processed_documents")
      .select(SEARCH_HIT_SOURCE_COLUMNS)
      .in("id", key.split(","))
      .then(({ data, error }) => {
        if (cancelled) return;
        const rows = new Map<string, SearchHitSourceRow>();
        for (const row of (data ?? []) as unknown as SearchHitSourceRow[]) {
          rows.set(row.id, row);
        }
        setState({ key, rows, error: error ? error.message : null });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!key) return { rows: new Map(), loading: false, error: null };
  const fresh = state.key === key;
  return {
    rows: fresh ? state.rows : new Map(),
    loading: !fresh,
    error: fresh ? state.error : null,
  };
}
