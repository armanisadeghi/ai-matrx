"use client";

// features/rag/components/source-inspector/useCitedChunk.ts
//
// Read the cited chunk's own anchor (pages, time) straight from
// `rag.kg_chunks` (RLS decides) so the Source viewer opens AT the cited
// passage even when the citation carries no page. A failed read is returned,
// never swallowed — the pane says it could not find the passage.

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { ragDb } from "@/utils/supabase/ragDb";
import { citedChunkFacts, type CitedChunkFacts } from "./citedAnchor";

export interface CitedChunkState {
  facts: CitedChunkFacts | null;
  loading: boolean;
  error: string | null;
}

export function useCitedChunk(chunkId: string | null): CitedChunkState {
  const [state, setState] = useState<{ forId: string | null } & CitedChunkState>({
    forId: null,
    facts: null,
    loading: false,
    error: null,
  });
  useEffect(() => {
    if (!chunkId) return undefined;
    let cancelled = false;
    void (async () => {
      const { data, error } = await ragDb(supabase)
        .from("kg_chunks")
        .select("page_numbers, metadata")
        .eq("id", chunkId)
        .maybeSingle();
      if (cancelled) return;
      setState({
        forId: chunkId,
        facts: data ? citedChunkFacts(data) : null,
        loading: false,
        error: error ? error.message : data ? null : "The cited passage was not found.",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [chunkId]);
  if (!chunkId) return { facts: null, loading: false, error: null };
  if (state.forId !== chunkId) return { facts: null, loading: true, error: null };
  return { facts: state.facts, loading: state.loading, error: state.error };
}
