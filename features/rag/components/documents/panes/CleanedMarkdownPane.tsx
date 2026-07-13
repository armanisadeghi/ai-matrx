"use client";

/**
 * The LLM-cleaned markdown for one page (stored in
 * `processed_document_pages.cleaned_text`). Section_kind /
 * section_title are surfaced as a header chip so the section taxonomy
 * is visible to the user without opening the chunk pane.
 *
 * Markdown rendering: defer the heavy renderer (react-markdown +
 * remark plugins) so the bundle cost only lands when the viewer route
 * is actually opened.
 */

import dynamic from "next/dynamic";
import type { PageDetail } from "@/features/rag/types/documents";

// react-markdown + remark-gfm together are ~100KB. Lazy.
const Markdown = dynamic(() => import("react-markdown"), { ssr: false });
const remarkGfm = dynamic(() => import("remark-gfm"), { ssr: false });

export interface CleanedMarkdownPaneProps {
  page: PageDetail | null;
  loading: boolean;
  error: string | null;
}

export function CleanedMarkdownPane({
  page,
  loading,
  error,
}: CleanedMarkdownPaneProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <header className="flex items-center justify-between px-3 py-2 border-b border-border text-xs text-muted-foreground">
        <span className="font-medium">Cleaned markdown</span>
        {page && (
          <span className="flex items-center gap-2">
            {page.section_kind && (
              <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-[10px] uppercase tracking-wide">
                {page.section_kind}
              </span>
            )}
            <span>
              {(page.cleaned_text ?? "").length.toLocaleString()} chars
            </span>
          </span>
        )}
      </header>
      <div className="flex-1 overflow-auto p-3 prose prose-sm dark:prose-invert max-w-none">
        {loading && (
          <div className="text-sm text-muted-foreground">Loading…</div>
        )}
        {error && (
          <div className="text-sm text-destructive">Error: {error}</div>
        )}
        {!loading &&
          !error &&
          page &&
          (page.cleaned_text ? (
            // @ts-expect-error react-markdown's plugin typings are loose
            <Markdown remarkPlugins={[remarkGfm]}>{page.cleaned_text}</Markdown>
          ) : (
            <p className="italic text-muted-foreground">
              No cleaned content — this document may not have been processed
              through the RAG cleanup pipeline yet. Re-process from the document
              admin page to populate.
            </p>
          ))}
      </div>
    </div>
  );
}
