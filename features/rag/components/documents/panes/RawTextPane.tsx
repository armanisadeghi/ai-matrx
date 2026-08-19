"use client";

/**
 * Raw extracted text for a single page. The string we render is exactly
 * what `processed_document_pages.raw_text` holds — useful for diff'ing
 * against the cleaned-markdown pane to see what the LLM cleanup
 * touched.
 */

import { useMemo } from "react";
import type { PageDetail } from "@/features/rag/types/documents";

export interface RawTextPaneProps {
  page: PageDetail | null;
  loading: boolean;
  error: string | null;
}

export function RawTextPane({ page, loading, error }: RawTextPaneProps) {
  const stats = useMemo(() => {
    if (!page) return null;
    const rawText = page.raw_text ?? "";
    return {
      chars: rawText.length,
      lines: rawText.split("\n").length,
      ocr: page.used_ocr,
      method: page.extraction_method ?? "unknown",
    };
  }, [page]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <header className="flex items-center justify-between px-3 py-2 border-b border-border text-xs text-muted-foreground">
        <span className="font-medium">Raw text</span>
        {stats && (
          <span>
            {stats.chars.toLocaleString()} chars · {stats.lines} lines ·{" "}
            {stats.method}
            {stats.ocr ? " (OCR)" : ""}
          </span>
        )}
      </header>
      <div className="flex-1 overflow-auto p-3">
        {loading && (
          <div className="text-sm text-muted-foreground">Loading…</div>
        )}
        {error && (
          <div className="text-sm text-destructive">Error: {error}</div>
        )}
        {!loading && !error && page && (
          <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-foreground">
            {page.raw_text || (
              <span className="italic text-muted-foreground">(empty page)</span>
            )}
          </pre>
        )}
      </div>
    </div>
  );
}
