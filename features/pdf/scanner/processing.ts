/**
 * Post-save processing status — direct Supabase reads (canonical UI↔DB
 * path; the clean/chunk/NER pipeline runs detached server-side after
 * /pdf/from-images returns, so the FE watches the rows it writes).
 *
 * Consumed by ProcessingView's 2s poll:
 * - per-page cleaned counts (docproc.processed_document_pages.cleaned_text)
 * - pipeline completion + entity/chunk totals
 *   (processed_documents.metadata.content_processing.current)
 * - whole-document clean_content presence (the reader's cleaned pane).
 */

import { supabase } from "@/utils/supabase/client";
import { docprocDb } from "@/utils/supabase/docprocDb";

export interface ProcessingStatus {
  pagesTotal: number;
  pagesCleaned: number;
  cleanContentReady: boolean;
  /** "completed" | "running" | "failed" | null (pipeline not reported yet). */
  runStatus: string | null;
  entities: number | null;
  chunks: number | null;
}

interface ContentProcessingCurrent {
  last_run_status?: string;
  entities?: number;
  chunks?: number;
}

export async function fetchProcessingStatus(
  docId: string,
): Promise<ProcessingStatus> {
  const db = docprocDb(supabase);
  const [totalRes, cleanedRes, cleanContentRes, docRes] = await Promise.all([
    db
      .from("processed_document_pages")
      .select("id", { count: "exact", head: true })
      .eq("processed_document_id", docId),
    db
      .from("processed_document_pages")
      .select("id", { count: "exact", head: true })
      .eq("processed_document_id", docId)
      .not("cleaned_text", "is", null),
    db
      .from("processed_documents")
      .select("id", { count: "exact", head: true })
      .eq("id", docId)
      .not("clean_content", "is", null),
    db.from("processed_documents").select("metadata").eq("id", docId).maybeSingle(),
  ]);

  const metadata = (docRes.data?.metadata ?? {}) as {
    content_processing?: { current?: ContentProcessingCurrent };
  };
  const current = metadata.content_processing?.current;

  return {
    pagesTotal: totalRes.count ?? 0,
    pagesCleaned: cleanedRes.count ?? 0,
    cleanContentReady: (cleanContentRes.count ?? 0) > 0,
    runStatus: current?.last_run_status ?? null,
    entities: current?.entities ?? null,
    chunks: current?.chunks ?? null,
  };
}

/** First page's raw text — the "here's what OCR read" peek. */
export async function fetchRawTextPreview(
  docId: string,
): Promise<string | null> {
  const { data } = await docprocDb(supabase)
    .from("processed_document_pages")
    .select("raw_text")
    .eq("processed_document_id", docId)
    .order("page_number", { ascending: true })
    .limit(1)
    .maybeSingle();
  const text = (data?.raw_text ?? "").trim();
  return text ? text.slice(0, 220) : null;
}

/**
 * The pre-navigation gate: clean content must actually be readable.
 * Per spec — on each miss, console.error (so timing gets adjusted) and
 * retry after 2s, 3 attempts total. Returns whether it ever showed up.
 */
export async function verifyCleanContentReady(docId: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const status = await fetchProcessingStatus(docId);
      if (status.cleanContentReady || status.pagesCleaned > 0) return true;
      console.error(
        `[scanner] clean content not ready for doc ${docId} ` +
          `(attempt ${attempt}/3, run=${status.runStatus ?? "unknown"}, ` +
          `cleaned=${status.pagesCleaned}/${status.pagesTotal}) — adjust navigation timing`,
      );
    } catch (err) {
      console.error(
        `[scanner] clean-content verification errored for doc ${docId} (attempt ${attempt}/3)`,
        err,
      );
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}
