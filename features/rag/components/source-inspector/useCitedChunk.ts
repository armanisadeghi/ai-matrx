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
import { docprocDb } from "@/utils/supabase/docprocDb";
import {
  citedChunkFacts,
  pageForPartOrdinal,
  parsePartId,
  type CitedChunkFacts,
} from "./citedAnchor";
import { isUuidShape } from "@ai-matrx/kit/uuid";

/** Read where one cited id sits: an indexed chunk's own row, or a part's page. */
async function readCitedFacts(
  id: string,
  documentId: string | null,
): Promise<{ facts: CitedChunkFacts | null; error: string | null }> {
  if (isUuidShape(id)) {
    const { data, error } = await ragDb(supabase)
      .from("kg_chunks")
      .select("page_numbers, metadata")
      .eq("id", id)
      .maybeSingle();
    if (error) return { facts: null, error: error.message };
    return data
      ? { facts: citedChunkFacts(data), error: null }
      : { facts: null, error: "The cited passage was not found." };
  }
  const part = parsePartId(id);
  // Not a chunk and not a page part (a packed "Part n" of a record's text):
  // the excerpt is all there is to show — not an error.
  if (!part) return { facts: { pageNumbers: null, part: true, t0Ms: null, t1Ms: null }, error: null };
  const { data, error } = await docprocDb(supabase)
    .from("processed_document_pages")
    .select("page_number, raw_char_count, cleaned_char_count")
    // The part's prefix is the document id, or — for a stored file — the FILE
    // id (`synthetic_prefix=file_id` server-side); the viewer knows the document.
    .eq("processed_document_id", documentId ?? part.documentId)
    .order("page_number", { ascending: true });
  if (error) return { facts: null, error: error.message };
  const page = pageForPartOrdinal(data ?? [], part.ordinal);
  return { facts: { pageNumbers: page ? [page] : null, part: true, t0Ms: null, t1Ms: null }, error: null };
}

export interface CitedChunkState {
  facts: CitedChunkFacts | null;
  loading: boolean;
  error: string | null;
}

export function useCitedChunk(
  chunkId: string | null,
  /** The viewer's processed document, once resolved. */
  documentId: string | null = null,
): CitedChunkState {
  const [state, setState] = useState<{ forId: string | null; forDoc: string | null } & CitedChunkState>({
    forId: null,
    forDoc: null,
    facts: null,
    loading: false,
    error: null,
  });
  useEffect(() => {
    if (!chunkId) return undefined;
    let cancelled = false;
    void (async () => {
      const { facts, error } = await readCitedFacts(chunkId, documentId);
      if (cancelled) return;
      setState({ forId: chunkId, forDoc: documentId, facts, loading: false, error });
    })();
    return () => {
      cancelled = true;
    };
  }, [chunkId, documentId]);
  if (!chunkId) return { facts: null, loading: false, error: null };
  if (state.forId !== chunkId || state.forDoc !== documentId) return { facts: null, loading: true, error: null };
  return { facts: state.facts, loading: state.loading, error: state.error };
}
