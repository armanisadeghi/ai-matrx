/**
 * features/page-extraction/hooks/useChunkPreview.ts
 *
 * Central "data lens" for the chunked-extraction UI. Reads:
 *   - The user's draft config (Redux)
 *   - All processed_document_pages rows for the active doc (Supabase)
 *
 * Produces, live:
 *   - Page-text bundles filtered to the draft's `scopePages`
 *   - Computed `ChunkPreviewItem[]` for the current chunk size + variations
 *   - Aggregate stats (count, total chars, avg, longest, shortest, empties)
 *
 * Used by both the inspector form (to show "you'll produce N chunks") and
 * the Extractions pane's Chunks tab (to render each chunk card).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectDraftForFile } from "@/features/page-extraction/redux/selectors";
import {
  computeChunkStats,
  previewChunks,
  type PageTextBundle,
} from "@/features/page-extraction/utils/chunk-preview";
import type {
  ChunkPreviewItem,
  ChunkStats,
  SourceVariationKind,
} from "@/features/page-extraction/types";
import type { ChunkingConfigDraft } from "@/features/page-extraction/redux/pageExtractionSlice";

interface PageRow {
  page_number: number;
  raw_text: string | null;
  cleaned_text: string | null;
}

export interface UseChunkPreviewResult {
  draft: ChunkingConfigDraft;
  /** All known page numbers from the source document (sorted asc). */
  availablePages: number[];
  /** chunks computed from `scopePages` ∩ `availablePages`. */
  chunks: ChunkPreviewItem[];
  stats: ChunkStats;
  loading: boolean;
  error: string | null;
}

/**
 * The minimal slice of chunking config needed to compute a preview. When the
 * Chunks tab is viewing a *saved* job (not the live inspector draft), it
 * passes the job's persisted config here so the preview survives a page
 * reload — the in-memory draft is empty after reload and is only hydrated by
 * the inspector form, which may not even be mounted.
 */
export type ChunkConfigOverride = Pick<
  ChunkingConfigDraft,
  "scopePages" | "chunkSize" | "chunkOverlap" | "sourceVariations"
>;

export function useChunkPreview(opts: {
  fileId: string | null;
  processedDocumentId: string | null;
  /** When set, compute the preview from this config instead of the draft. */
  configOverride?: ChunkConfigOverride | null;
}): UseChunkPreviewResult {
  const { fileId, processedDocumentId, configOverride } = opts;
  const draft = useAppSelector((s) => selectDraftForFile(s, fileId));
  const cfg = configOverride ?? draft;

  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load every page once per processed doc. Page text is the source of
  // truth for the preview; we don't try to be clever about partial loads.
  useEffect(() => {
    if (!processedDocumentId) {
      setPages([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (supabase as any)
      .schema("docproc").from("processed_document_pages")
      .select("page_number, raw_text, cleaned_text")
      .eq("processed_document_id", processedDocumentId)
      .order("page_number", { ascending: true })
      .then(
        ({
          data,
          error: err,
        }: {
          data: PageRow[] | null;
          error: { message: string } | null;
        }) => {
          if (cancelled) return;
          if (err) setError(err.message);
          else setPages(data ?? []);
        },
      )
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [processedDocumentId]);

  const availablePages = useMemo(
    () => pages.map((p) => p.page_number).sort((a, b) => a - b),
    [pages],
  );

  const bundles = useMemo<PageTextBundle[]>(() => {
    if (cfg.scopePages.length === 0) return [];
    const scope = new Set(cfg.scopePages);
    return pages
      .filter((p) => scope.has(p.page_number))
      .map<PageTextBundle>((p) => {
        const texts: Partial<Record<SourceVariationKind, string>> = {};
        for (const v of cfg.sourceVariations) {
          if (v === "clean_text") texts.clean_text = p.cleaned_text ?? "";
          else if (v === "raw_text") texts.raw_text = p.raw_text ?? "";
          // pdf_page is text-less; the textual preview shows "(PDF attachment)"
          // — see ChunkCard for the visual.
        }
        return { pageNumber: p.page_number, texts };
      });
  }, [pages, cfg.scopePages, cfg.sourceVariations]);

  const chunks = useMemo(() => {
    if (cfg.chunkSize == null || cfg.chunkSize < 1) return [];
    return previewChunks({
      pages: bundles,
      chunkSize: cfg.chunkSize,
      chunkOverlap: cfg.chunkOverlap,
      variations: cfg.sourceVariations,
    });
  }, [bundles, cfg.chunkSize, cfg.chunkOverlap, cfg.sourceVariations]);

  const stats = useMemo(() => computeChunkStats(chunks), [chunks]);

  return { draft, availablePages, chunks, stats, loading, error };
}
