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
import { docprocDb } from "@/utils/supabase/docprocDb";

const docproc = docprocDb(supabase);

export interface PageBundle {
  pageNumber: number;
  rawText: string;
  rawCharCount: number;
  cleanedText: string;
  cleanedCharCount: number;
  sectionKind: string | null;
  sectionTitle: string | null;
  usedOcr: boolean;
  extractionMethod: string | null;
  extractionConfidence: number | null;
  verifiedAt: string | null;
  verificationFlags: string[];
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
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (!enabled || !processedDocumentId || pageNumber == null) {
        if (!cancelled) {
          setPage(null);
          // Clear loading too — otherwise a disable mid-flight strands the
          // "Loading page…" spinner forever (review P2).
          setLoading(false);
          setError(null);
        }
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { data, error: dbError } = await docproc
          .from("processed_document_pages")
          .select(
            "page_number, raw_text, raw_char_count, cleaned_text, cleaned_char_count, section_kind, section_title, used_ocr, extraction_method, extraction_confidence, verified_at, verification_flags, image_cld_file_id",
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
        setPage({
          pageNumber: data.page_number ?? pageNumber,
          rawText: data.raw_text ?? "",
          rawCharCount: data.raw_char_count ?? 0,
          cleanedText: data.cleaned_text ?? "",
          cleanedCharCount: data.cleaned_char_count ?? 0,
          sectionKind: data.section_kind ?? null,
          sectionTitle: data.section_title ?? null,
          usedOcr: data.used_ocr ?? false,
          extractionMethod: data.extraction_method ?? null,
          extractionConfidence: data.extraction_confidence ?? null,
          verifiedAt: data.verified_at ?? null,
          verificationFlags: data.verification_flags ?? [],
          imageCldFileId: data.image_cld_file_id ?? null,
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load page content");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [processedDocumentId, pageNumber, enabled]);

  return { page, loading, error };
}
