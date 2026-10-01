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
  citedPortion,
  pageForPartOrdinal,
  portionForExcerpt,
  parsePartId,
  type CitedChunkFacts,
  type CitedPortion,
} from "./citedAnchor";
import { isUuidShape } from "@ai-matrx/kit/uuid";

/** The portion row a page number names inside a document (null when absent). */
async function readPortion(
  documentId: string | null,
  pageNumber: number | null,
): Promise<CitedPortion | null> {
  if (!documentId || pageNumber == null) return null;
  const { data } = await docprocDb(supabase)
    .from("processed_document_pages")
    .select("page_number, portion_kind, locator")
    .eq("processed_document_id", documentId)
    .eq("page_number", pageNumber)
    .maybeSingle();
  // A missing portion row only costs the place its name (the label falls back
  // to the page numbers) — the passage still opens.
  return data ? citedPortion(data) : null;
}

/** Read where one cited id sits: an indexed chunk's own row, or a part's page. */
async function readCitedFacts(
  id: string,
  documentId: string | null,
): Promise<{ facts: CitedChunkFacts | null; error: string | null }> {
  if (isUuidShape(id)) {
    const { data, error } = await ragDb(supabase)
      .from("kg_chunks")
      .select("page_numbers, metadata, processed_document_id")
      .eq("id", id)
      .maybeSingle();
    if (error) return { facts: null, error: error.message };
    if (!data) return { facts: null, error: "The cited passage was not found." };
    const facts = citedChunkFacts(data);
    const doc = (data.processed_document_id as string | null) ?? documentId;
    const first = facts.pageNumbers?.length ? Math.min(...facts.pageNumbers) : null;
    return { facts: { ...facts, documentId: doc, portion: await readPortion(doc, first) }, error: null };
  }
  const part = parsePartId(id);
  // Not a chunk and not a page part (a packed "Part n" of a record's text):
  // the excerpt is all there is to show — not an error.
  if (!part) return { facts: { pageNumbers: null, part: true, t0Ms: null, t1Ms: null }, error: null };
  const doc = documentId ?? part.documentId;
  const { data, error } = await docprocDb(supabase)
    .from("processed_document_pages")
    .select("page_number, raw_char_count, cleaned_char_count, portion_kind, locator")
    // The part's prefix is the document id, or — for a stored file — the FILE
    // id (`synthetic_prefix=file_id` server-side); the viewer knows the document.
    .eq("processed_document_id", doc)
    .order("page_number", { ascending: true });
  if (error) return { facts: null, error: error.message };
  const rows = data ?? [];
  const page = pageForPartOrdinal(rows, part.ordinal);
  const row = page != null ? rows.find((r) => r.page_number === page) : undefined;
  return {
    facts: {
      pageNumbers: page ? [page] : null,
      part: true,
      t0Ms: null,
      t1Ms: null,
      documentId: doc,
      portion: row ? citedPortion(row) : null,
    },
    error: null,
  };
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

/**
 * A citation that names a RECORD's packed part (`<record id>:<n>` — a
 * transcript picked as a record carries no document id): find the record's
 * processed document and the portion the quoted passage sits in, so the
 * citation can name and open its real place (a video's time). A failed read
 * is returned; a quote that is not found is no place, never a guess.
 */
export async function readRecordCitedFacts(
  recordId: string,
  excerpt: string | null,
): Promise<{ facts: CitedChunkFacts | null; error: string | null }> {
  const { data: docs, error: docError } = await docprocDb(supabase)
    .from("processed_documents")
    .select("id")
    .eq("source_id", recordId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (docError) return { facts: null, error: docError.message };
  const documentId = (docs?.[0]?.id as string | undefined) ?? null;
  if (!documentId) return { facts: null, error: null };
  const { data, error } = await docprocDb(supabase)
    .from("processed_document_pages")
    .select("page_number, portion_kind, locator, cleaned_text, raw_text")
    .eq("processed_document_id", documentId)
    .order("page_number", { ascending: true });
  if (error) return { facts: null, error: error.message };
  const row = portionForExcerpt(data ?? [], excerpt);
  return {
    facts: {
      pageNumbers: row?.page_number != null ? [row.page_number] : null,
      part: true,
      t0Ms: null,
      t1Ms: null,
      documentId,
      portion: row ? citedPortion(row) : null,
    },
    error: null,
  };
}

/** `readRecordCitedFacts` as state (null id → nothing to read). */
export function useRecordCitedFacts(recordId: string | null, excerpt: string | null): CitedChunkState {
  const [state, setState] = useState<{ forId: string | null } & CitedChunkState>({
    forId: null,
    facts: null,
    loading: false,
    error: null,
  });
  useEffect(() => {
    if (!recordId) return undefined;
    let cancelled = false;
    void (async () => {
      const { facts, error } = await readRecordCitedFacts(recordId, excerpt);
      if (!cancelled) setState({ forId: recordId, facts, loading: false, error });
    })();
    return () => {
      cancelled = true;
    };
  }, [recordId, excerpt]);
  if (!recordId) return { facts: null, loading: false, error: null };
  if (state.forId !== recordId) return { facts: null, loading: true, error: null };
  return { facts: state.facts, loading: state.loading, error: state.error };
}
