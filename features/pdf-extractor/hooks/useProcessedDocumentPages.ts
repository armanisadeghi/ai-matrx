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

export function useProcessedDocumentPages({
  processedDocumentId,
  enabled = true,
}: Args): {
  pages: PdfPageRow[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [pages, setPages] = useState<PdfPageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!enabled || !processedDocumentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("processed_document_pages")
          .select(
            "id, page_index, page_number, width, height, rotation, raw_text, raw_char_count, cleaned_text, cleaned_char_count, section_kind, section_title, is_continuation, used_ocr, extraction_method, extraction_confidence, blocks, words, image_cld_file_id, image_dpi",
          )
          .eq("processed_document_id", processedDocumentId)
          .order("page_index", { ascending: true });
        if (err) throw err;
        if (cancelled) return;
        setPages(((data ?? []) as Record<string, unknown>[]).map(rowFromApi));
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
  }, [processedDocumentId, enabled, refreshKey]);

  return { pages, loading, error, refresh };
}
