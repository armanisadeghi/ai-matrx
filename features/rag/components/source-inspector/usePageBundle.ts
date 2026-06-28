"use client";

/**
 * usePageBundle — load the per-page extraction content for ONE page of a
 * processed document (raw text · clean text · rendered-page image · section).
 *
 * The PDF studio's `useProcessedDocumentPages` loads EVERY page of a doc — fine
 * for a 30s-cached studio, wasteful for the source inspector, which only ever
 * needs the one page a citation points at (a 400-page reference would otherwise
 * pull 400 rows of raw+clean text just to show one). This is the focused read:
 * a single `processed_document_pages` row by `(processed_document_id, page_number)`.
 *
 * Direct supabase read — `processed_document_pages` is a normal RLS table, so
 * the canonical path is the browser straight to Postgres (not a Python hop).
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";

export interface PageBundle {
  pageNumber: number;
  rawText: string;
  rawCharCount: number;
  cleanedText: string;
  cleanedCharCount: number;
  sectionKind: string | null;
  sectionTitle: string | null;
  usedOcr: boolean;
  /** Rendered-page image in cld_files — the visual fallback when there's no
   *  live PDF to render (non-PDF source, or source bytes removed). */
  imageCldFileId: string | null;
}

interface Args {
  processedDocumentId: string | null;
  pageNumber: number | null;
  enabled?: boolean;
}

export function usePageBundle({
  processedDocumentId,
  pageNumber,
  enabled = true,
}: Args): { page: PageBundle | null; loading: boolean; error: string | null } {
  const [page, setPage] = useState<PageBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !processedDocumentId || pageNumber == null) {
      setPage(null);
      // Clear loading too — otherwise a disable mid-flight strands the
      // "Loading page…" spinner forever (review P2).
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data, error: dbError } = await (supabase as any)
          .schema("docproc").from("processed_document_pages")
          .select(
            "page_number, raw_text, raw_char_count, cleaned_text, cleaned_char_count, section_kind, section_title, used_ocr, image_cld_file_id",
          )
          .eq("processed_document_id", processedDocumentId)
          .eq("page_number", pageNumber)
          .maybeSingle();
        if (dbError) throw dbError;
        if (cancelled) return;
        if (!data) {
          setPage(null);
          return;
        }
        const row = data as Record<string, unknown>;
        setPage({
          pageNumber: (row.page_number as number) ?? pageNumber,
          rawText: (row.raw_text as string) ?? "",
          rawCharCount: (row.raw_char_count as number) ?? 0,
          cleanedText: (row.cleaned_text as string) ?? "",
          cleanedCharCount: (row.cleaned_char_count as number) ?? 0,
          sectionKind: (row.section_kind as string | null) ?? null,
          sectionTitle: (row.section_title as string | null) ?? null,
          usedOcr: (row.used_ocr as boolean) ?? false,
          imageCldFileId: (row.image_cld_file_id as string | null) ?? null,
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load page content");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [processedDocumentId, pageNumber, enabled]);

  return { page, loading, error };
}
