// features/kg-suggestions/hooks/useKgSuggestionEnrichment.ts
//
// Resolves the human-readable picture behind one suggestion row (target path
// + items + current values, and the source title). Each decision card calls
// this for its own row; a module-level promise cache keyed by suggestion id
// dedupes concurrent/repeat resolves so the same row never re-fetches when it
// re-renders or appears in two surfaces at once.

"use client";

import { useEffect, useRef, useState } from "react";
import {
  enrichSuggestion,
  type EnrichedSuggestion,
} from "@/features/kg-suggestions/service/kgEnrichmentService";
import type { KgSuggestionRow } from "@/features/kg-suggestions/types";

const cache = new Map<string, Promise<EnrichedSuggestion>>();

function getEnrichment(row: KgSuggestionRow): Promise<EnrichedSuggestion> {
  const existing = cache.get(row.id);
  if (existing) return existing;
  const p = enrichSuggestion(row);
  cache.set(row.id, p);
  // Drop failed resolves from the cache so a later mount can retry.
  p.catch(() => cache.delete(row.id));
  return p;
}

export interface UseKgSuggestionEnrichmentResult {
  data: EnrichedSuggestion | null;
  loading: boolean;
}

export function useKgSuggestionEnrichment(
  row: KgSuggestionRow,
): UseKgSuggestionEnrichmentResult {
  const [data, setData] = useState<EnrichedSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const idRef = useRef(row.id);

  useEffect(() => {
    let active = true;
    idRef.current = row.id;
    setLoading(true);
    getEnrichment(row)
      .then((res) => {
        if (active && idRef.current === row.id) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active && idRef.current === row.id) {
          setData(null);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [row]);

  return { data, loading };
}
