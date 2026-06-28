"use client";

/**
 * useProcessedDocumentPages — fetches per-page rows for a processed document.
 *
 * One row per page — `processed_document_pages.page_number` is 1-based.
 * Carries:
 *   - raw_text          (System A's per-page extraction)
 *   - cleaned_text      (System B's per-page LLM cleanup)
 *   - section_kind      (heading / body / footer / …)
 *   - blocks / words    (PdfTextBlock[] / PdfTextWord[] for bbox overlays)
 *   - image_cld_file_id (rendered page image — fetch via cld_files when needed)
 *   - width / height / rotation (for the bbox overlay coordinate space)
 *
 * Legacy documents that haven't been re-processed return an empty array;
 * the consuming UI surfaces a "re-extract to populate" CTA in that case.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

export interface PdfPageRow {
  id: string;
  pageIndex: number;
  pageNumber: number;
  width: number | null;
  height: number | null;
  rotation: number | null;
  rawText: string;
  rawCharCount: number;
  cleanedText: string;
  cleanedCharCount: number;
  sectionKind: string | null;
  sectionTitle: string | null;
  isContinuation: boolean;
  usedOcr: boolean;
  extractionMethod: string | null;
  extractionConfidence: number | null;
  blocks: unknown[] | null;
  words: unknown[] | null;
  imageCldFileId: string | null;
  imageDpi: number | null;
}

interface Args {
  processedDocumentId: string;
  enabled?: boolean;
}

function rowFromApi(row: Record<string, unknown>): PdfPageRow {
  return {
    id: row.id as string,
    pageIndex: (row.page_index as number) ?? 0,
    pageNumber: (row.page_number as number) ?? 0,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    rotation: (row.rotation as number | null) ?? null,
    rawText: (row.raw_text as string) ?? "",
    rawCharCount: (row.raw_char_count as number) ?? 0,
    cleanedText: (row.cleaned_text as string) ?? "",
    cleanedCharCount: (row.cleaned_char_count as number) ?? 0,
    sectionKind: (row.section_kind as string | null) ?? null,
    sectionTitle: (row.section_title as string | null) ?? null,
    isContinuation: (row.is_continuation as boolean) ?? false,
    usedOcr: (row.used_ocr as boolean) ?? false,
    extractionMethod: (row.extraction_method as string | null) ?? null,
    extractionConfidence: (row.extraction_confidence as number | null) ?? null,
    blocks: (row.blocks as unknown[] | null) ?? null,
    words: (row.words as unknown[] | null) ?? null,
    imageCldFileId: (row.image_cld_file_id as string | null) ?? null,
    imageDpi: (row.image_dpi as number | null) ?? null,
  };
}

// ─── Module-scoped fetch dedup + short cache ─────────────────────────────────
//
// The PDF studio remounts when navigating between `/tools/pdf-extractor`
// and `/tools/pdf-extractor/[id]`, so every doc-pick fires the per-page
// SELECT twice — once on the parent shell, once on the parameterized
// child. Multiple surfaces (PdfStudioShell, SyncedPdfTextView) also call
// the hook simultaneously for the same docId, doubling that again.
//
// Same shape as the `fetchProcessedDocument` dedup shipped in `76923f146`:
// an in-flight `Map<key, Promise>` so concurrent callers share one
// Supabase round-trip, plus a small resolved cache so a fresh result is
// reused for `FETCH_PAGES_CACHE_TTL_MS`. The key includes `userId` so a
// session switch can't reuse the previous user's rows.

const FETCH_PAGES_CACHE_TTL_MS = 30_000;

interface PagesCacheEntry {
  resolvedAt: number;
  pages: PdfPageRow[];
}

const fetchPagesInflight = new Map<string, Promise<PdfPageRow[]>>();
const fetchPagesCache = new Map<string, PagesCacheEntry>();

function fetchPagesCacheKey(
  processedDocumentId: string,
  userId: string | null,
): string {
  return `${userId ?? "<none>"}:${processedDocumentId}`;
}

async function fetchProcessedDocumentPages(
  processedDocumentId: string,
  userId: string | null,
): Promise<PdfPageRow[]> {
  const key = fetchPagesCacheKey(processedDocumentId, userId);

  const cached = fetchPagesCache.get(key);
  if (cached && Date.now() - cached.resolvedAt < FETCH_PAGES_CACHE_TTL_MS) {
    return cached.pages;
  }

  const existing = fetchPagesInflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const { data, error } = await (supabase as any)
      .schema("docproc")
      .from("processed_document_pages")
      .select(
        "id, page_index, page_number, width, height, rotation, raw_text, raw_char_count, cleaned_text, cleaned_char_count, section_kind, section_title, is_continuation, used_ocr, extraction_method, extraction_confidence, blocks, words, image_cld_file_id, image_dpi",
      )
      .eq("processed_document_id", processedDocumentId)
      .order("page_index", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map(rowFromApi);
  })()
    .then((pages) => {
      fetchPagesCache.set(key, { resolvedAt: Date.now(), pages });
      return pages;
    })
    .finally(() => {
      fetchPagesInflight.delete(key);
    });

  fetchPagesInflight.set(key, promise);
  return promise;
}

/**
 * Drop the cached per-page rows for `processedDocumentId`. Call after a
 * re-extract / re-clean / re-chunk that rewrites `processed_document_pages`
 * so the next read sees the fresh state instead of the 30s-stale cache.
 *
 * Pass no args to evict everything (e.g. on sign-out / user switch).
 */
export function invalidateProcessedDocumentPages(
  processedDocumentId?: string,
): void {
  if (processedDocumentId == null) {
    fetchPagesCache.clear();
    return;
  }
  for (const key of fetchPagesCache.keys()) {
    if (key.endsWith(`:${processedDocumentId}`)) {
      fetchPagesCache.delete(key);
    }
  }
}

export function useProcessedDocumentPages({
  processedDocumentId,
  enabled = true,
}: Args): {
  pages: PdfPageRow[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const userId = useAppSelector(selectUserId);
  const [pages, setPages] = useState<PdfPageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Exposed `refresh()` is the explicit "give me fresh data" lever — bust
  // the cache before re-running, otherwise the new effect hits the 30s
  // entry and returns stale rows. The initial mount effect intentionally
  // does NOT invalidate (it relies on the cache for the dedup win).
  const refresh = useCallback(() => {
    if (processedDocumentId) {
      invalidateProcessedDocumentPages(processedDocumentId);
    }
    setRefreshKey((k) => k + 1);
  }, [processedDocumentId]);

  useEffect(() => {
    if (!enabled || !processedDocumentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const result = await fetchProcessedDocumentPages(
          processedDocumentId,
          userId,
        );
        if (cancelled) return;
        setPages(result);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load pages");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [processedDocumentId, enabled, refreshKey, userId]);

  return { pages, loading, error, refresh };
}
