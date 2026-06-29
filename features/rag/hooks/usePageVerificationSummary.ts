/**
 * features/rag/hooks/usePageVerificationSummary.ts
 *
 * Reads page-verification results for a processed document — verified count,
 * flagged count, and a per-reason breakdown — by querying public.
 * processed_document_pages DIRECTLY via Supabase (no Python round-trip).
 *
 * This is the honest source of truth for the "Verified pages" card: page
 * verification persists verified_at + verification_flags ON the page rows
 * (migration 0130), so the count is real and survives refresh, anchored to the
 * exact source page. It is also the data behind "why 605/618" — the no_text /
 * clean_emptied / clean_shrank reasons explain every empty page.
 *
 * Architecture note: this is a deliberate example of reading PUBLIC tables
 * straight from the browser via Supabase instead of routing data through the
 * Python compute server (see RAG task #15).
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";

/** Stable flag-reason strings (mirror matrx_rag/page_verification.py). */
export const VERIFICATION_REASON_LABELS: Record<string, string> = {
  no_text: "No text — image / scanned page",
  near_empty: "Nearly empty",
  low_confidence: "Low extraction confidence",
  clean_emptied: "Cleaner removed all text",
  clean_shrank: "Cleaner dropped most text",
};

/** Short chips for a compact breakdown line. */
export const VERIFICATION_REASON_SHORT: Record<string, string> = {
  no_text: "no text",
  near_empty: "near-empty",
  low_confidence: "low confidence",
  clean_emptied: "cleaner-emptied",
  clean_shrank: "cleaner-shrank",
};

export function verificationReasonLabel(reason: string): string {
  return VERIFICATION_REASON_LABELS[reason] ?? reason;
}

export interface PageVerificationSummary {
  /** Total pages on the doc. */
  total: number;
  /** Pages with verified_at set (a real "verified N" count). */
  verified: number;
  /** Pages carrying at least one flag. */
  flagged: number;
  /** reason -> page count. */
  byReason: Record<string, number>;
  loading: boolean;
  error: string | null;
  /** True once a verification has run (verified > 0). */
  hasRun: boolean;
  refresh: () => void;
}

export function usePageVerificationSummary(
  processedDocumentId: string | null | undefined,
): PageVerificationSummary {
  const [state, setState] = useState<
    Omit<PageVerificationSummary, "refresh">
  >({
    total: 0,
    verified: 0,
    flagged: 0,
    byReason: {},
    loading: Boolean(processedDocumentId),
    error: null,
    hasRun: false,
  });

  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!processedDocumentId) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    void (supabase as any)
      .schema("docproc").from("processed_document_pages")
      .select("verified_at, verification_flags")
      .eq("processed_document_id", processedDocumentId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState((s) => ({ ...s, loading: false, error: error.message }));
          return;
        }
        const rows = data ?? [];
        let verified = 0;
        let flagged = 0;
        const byReason: Record<string, number> = {};
        for (const r of rows) {
          if (r.verified_at) verified += 1;
          const flags = (r.verification_flags ?? []) as string[];
          if (flags.length > 0) {
            flagged += 1;
            for (const f of flags) byReason[f] = (byReason[f] ?? 0) + 1;
          }
        }
        setState({
          total: rows.length,
          verified,
          flagged,
          byReason,
          loading: false,
          error: null,
          hasRun: verified > 0,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [processedDocumentId, nonce]);

  return { ...state, refresh };
}
