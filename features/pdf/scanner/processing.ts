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
    // cleaned_text is NOT NULL (default '') — "is not null" counted every
    // page as cleaned the moment the row landed, which made the clean step
    // look instantly complete. cleaned_char_count is 0 until the LLM
    // cleanup actually writes the page.
    db
      .from("processed_document_pages")
      .select("id", { count: "exact", head: true })
      .eq("processed_document_id", docId)
      .gt("cleaned_char_count", 0),
    db
      .from("processed_documents")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("id", docId)
      .not("clean_content", "is", null),
    db.from("processed_documents").select("metadata").is("deleted_at", null).eq("id", docId).maybeSingle(),
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

/**
 * Per-page analysis rows for the live ledger: as the detached clean
 * pipeline works, each page gains an AI section title/kind and a cleaned
 * char count. Polled alongside fetchProcessingStatus during the clean step.
 */
export interface PageAnalysisRow {
  pageNumber: number;
  title: string | null;
  kind: string | null;
  rawChars: number;
  cleaned: boolean;
  usedOcr: boolean;
}

export async function fetchPageAnalysis(
  docId: string,
): Promise<PageAnalysisRow[]> {
  const { data } = await docprocDb(supabase)
    .from("processed_document_pages")
    .select(
      "page_number, section_title, section_kind, cleaned_char_count, raw_char_count, used_ocr",
    )
    .eq("processed_document_id", docId)
    .order("page_number", { ascending: true });
  return (data ?? []).map((row) => ({
    pageNumber: row.page_number,
    title: row.section_title,
    kind: row.section_kind,
    rawChars: row.raw_char_count,
    cleaned: (row.cleaned_char_count ?? 0) > 0,
    usedOcr: row.used_ocr,
  }));
}

/**
 * The AI's ACTUAL cleaned output for a set of pages — what the model wrote,
 * not how many pages it got through.
 *
 * 🚨 THE FLOATING LAW: a count is not output. The clean step is the expensive,
 * multi-LLM part of this pipeline and the user must watch it produce words.
 * The clean pipeline runs DETACHED server-side (started by /pdf/from-images,
 * no client-reachable stream), so the closest thing to a stream is reading the
 * rows it writes as it writes them. Callers pass ONLY the page numbers they
 * have not read yet — a page's cleaned_text is fetched exactly once, never
 * re-pulled on every 2s tick.
 */
export interface CleanedPageText {
  pageNumber: number;
  title: string | null;
  text: string;
}

export async function fetchCleanedPageText(
  docId: string,
  pageNumbers: number[],
): Promise<CleanedPageText[]> {
  if (pageNumbers.length === 0) return [];
  const { data, error } = await docprocDb(supabase)
    .from("processed_document_pages")
    .select("page_number, section_title, cleaned_text")
    .eq("processed_document_id", docId)
    .in("page_number", pageNumbers)
    .order("page_number", { ascending: true });
  if (error) {
    // Transient — the next tick asks for the same pages again (they stay out
    // of the caller's "seen" set until they actually arrive).
    console.warn(`[scanner] cleaned-text read failed for doc ${docId}`, error);
    return [];
  }
  return (data ?? [])
    .filter((row) => (row.cleaned_text ?? "").trim().length > 0)
    .map((row) => ({
      pageNumber: row.page_number,
      title: row.section_title,
      text: row.cleaned_text as string,
    }));
}

/**
 * Recent scans for the desktop home/sidebar — processed documents born
 * from /pdf/from-images, newest first. Direct docproc read (canonical
 * UI↔DB path).
 */
export interface RecentScanRow {
  docId: string;
  name: string;
  createdAt: string;
  itemCount: number | null;
  cleanReady: boolean;
  /** Backing cloud file (source_kind='cld_file') — drives the card thumbnail
   *  via the canonical `<MediaThumbnail>`; null for legacy/unlinked docs. */
  fileId: string | null;
}

export async function fetchRecentScans(limit = 12): Promise<RecentScanRow[]> {
  // "Recent scans" means MY scans — the org-member RLS policy would
  // otherwise surface teammates' org-stamped scans in the personal list.
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user.id;
  if (!uid) return [];

  const { data, error } = await docprocDb(supabase)
    .from("processed_documents")
    // clean_content_completed_at is the cheap presence marker — never pull
    // the (potentially huge) clean_content body for a list view.
    .select(
      "id, name, created_at, metadata, clean_content_completed_at, source_kind, source_id",
    )
    .is("deleted_at", null)
    .eq("owner_id", uid)
    .eq("metadata->>via", "/pdf/from-images")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[scanner] recent-scans read failed", error);
    throw error;
  }
  return (data ?? []).map((row) => {
    const meta = (row.metadata ?? {}) as { item_count?: number };
    return {
      docId: row.id,
      name: row.name,
      createdAt: row.created_at,
      itemCount: typeof meta.item_count === "number" ? meta.item_count : null,
      cleanReady: Boolean(row.clean_content_completed_at),
      fileId: row.source_kind === "cld_file" ? row.source_id : null,
    };
  });
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
      if (status.cleanContentReady) return true;
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
