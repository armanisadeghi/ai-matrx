/**
 * features/files/components/core/FilePreview/previewers/OfficePreview.tsx
 *
 * Word / PowerPoint previewer — server-side extraction. Calls aidream
 * `GET /office/{file_id}/markdown` (the matrx-files Office codec, with the
 * LibreOffice bridge for legacy .doc/.ppt) and renders the result as
 * formatted markdown. Decks render slide-by-slide with titled dividers.
 *
 * The bytes never reach the browser — the server parses; we render text.
 * Extractions are cached at module level (keyed by fileId) so closing and
 * reopening the preview pane is instant, mirroring useFileBlob's blob-cache
 * ethos on a much smaller payload.
 *
 * DELIBERATE standalone react-markdown (same reasoning as MarkdownPreview):
 * this module is only entered via the lazy previewer edge, so the markdown
 * stack's weight stays inside the previewer chunk — and it must NOT pull the
 * shared MarkdownCore chunk that chat surfaces stream through.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  Presentation,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { guardMarkdownDelimiters } from "@/lib/markdown/delimiter-guard";
import {
  extractOfficeMarkdown,
  type OfficeExtraction,
} from "@/features/files/api/office";
import { extractErrorMessage } from "@/utils/errors";

// Module-level extraction cache — survives pane close/reopen. Small payloads
// (markdown text), so a simple insertion-capped Map is enough.
const extractionCache = new Map<string, OfficeExtraction>();
const CACHE_MAX_ENTRIES = 40;
const inflight = new Map<string, Promise<OfficeExtraction>>();

async function getExtraction(fileId: string): Promise<OfficeExtraction> {
  const cached = extractionCache.get(fileId);
  if (cached) return cached;
  let p = inflight.get(fileId);
  if (!p) {
    p = extractOfficeMarkdown(fileId).then((result) => {
      if (extractionCache.size >= CACHE_MAX_ENTRIES) {
        const oldest = extractionCache.keys().next().value;
        if (oldest !== undefined) extractionCache.delete(oldest);
      }
      extractionCache.set(fileId, result);
      return result;
    });
    inflight.set(fileId, p);
    void p.finally(() => {
      if (inflight.get(fileId) === p) inflight.delete(fileId);
    });
  }
  return p;
}

/** Drop the cached extraction (e.g. after a new version is uploaded). */
export function invalidateOfficeExtraction(fileId: string) {
  extractionCache.delete(fileId);
}

const KIND_LABEL: Record<string, string> = {
  docx: "Word document",
  doc: "Word document (legacy)",
  pptx: "PowerPoint",
  ppt: "PowerPoint (legacy)",
  xlsx: "Excel workbook",
  xls: "Excel workbook (legacy)",
};

export interface OfficePreviewProps {
  fileId: string;
  fileName?: string;
  className?: string;
}

export function OfficePreview({
  fileId,
  fileName,
  className,
}: OfficePreviewProps) {
  // State is keyed by fileId and reset DURING RENDER when the file changes
  // (the React-sanctioned "adjust state when props change" pattern) — the
  // effect below only performs the async fetch, never synchronous setState.
  const [state, setState] = useState<{
    fileId: string;
    extraction: OfficeExtraction | null;
    error: string | null;
  }>(() => ({
    fileId,
    extraction: extractionCache.get(fileId) ?? null,
    error: null,
  }));
  if (state.fileId !== fileId) {
    setState({
      fileId,
      extraction: extractionCache.get(fileId) ?? null,
      error: null,
    });
  }
  const [copied, setCopied] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (extractionCache.get(fileId)) return undefined;
    let cancelled = false;
    getExtraction(fileId)
      .then((result) => {
        if (cancelled) return;
        setState((s) =>
          s.fileId === fileId ? { ...s, extraction: result, error: null } : s,
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setState((s) =>
          s.fileId === fileId
            ? {
                ...s,
                error:
                  extractErrorMessage(err) || "Failed to read this document",
              }
            : s,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, retryToken]);

  const extraction = state.fileId === fileId ? state.extraction : null;
  const error = state.fileId === fileId ? state.error : null;

  const onCopy = useCallback(async () => {
    if (!extraction?.markdown) return;
    try {
      await navigator.clipboard.writeText(extraction.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* non-secure contexts can't write to the clipboard */
    }
  }, [extraction]);

  if (error) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center",
          className,
        )}
        role="alert"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            Couldn&apos;t read this document
          </h3>
          <p className="max-w-md text-xs text-muted-foreground break-words">
            {error}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setState((s) => ({ ...s, error: null }));
            setRetryToken((t) => t + 1);
          }}
          className="rounded-md border bg-background px-3 py-1 text-xs font-medium hover:bg-accent"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!extraction) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-2",
          className,
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Reading document…
        </span>
      </div>
    );
  }

  const kindLabel =
    KIND_LABEL[extraction.office_kind] ?? extraction.office_kind.toUpperCase();
  const isDeck =
    extraction.office_kind === "pptx" || extraction.office_kind === "ppt";
  const slides = isDeck ? (extraction.portions ?? []) : [];
  const warnings = extraction.warnings ?? [];

  return (
    <div className={cn("flex h-full w-full flex-col bg-card", className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-1 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          {isDeck && <Presentation className="h-3 w-3 shrink-0" />}
          <span className="truncate">
            {kindLabel}
            {isDeck && slides.length > 0
              ? ` · ${slides.length} slide${slides.length === 1 ? "" : "s"}`
              : ""}
            {" · extracted text"}
          </span>
          {warnings.length > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-1 text-amber-600 dark:text-amber-400"
              title={warnings.join("\n")}
            >
              <AlertTriangle className="h-3 w-3" />
              {warnings.length}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => void onCopy()}
          aria-label="Copy extracted markdown to clipboard"
          title="Copy the extracted markdown to the clipboard"
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-accent",
            copied && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy markdown"}
        </button>
      </div>
      <div className="flex-1 overflow-auto px-6 py-5">
        {isDeck && slides.length > 0 ? (
          <div className="space-y-6">
            {slides.map((slide) => (
              <section
                key={slide.index}
                className="rounded-lg border border-border bg-background/40 px-5 py-4"
              >
                <div className="mb-2 flex items-baseline gap-2 border-b border-border/60 pb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Slide {slide.number}
                  </span>
                  {slide.title && (
                    <span className="truncate text-xs font-medium text-foreground">
                      {slide.title}
                    </span>
                  )}
                </div>
                <article className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {guardMarkdownDelimiters(slide.markdown ?? "").text}
                  </ReactMarkdown>
                </article>
              </section>
            ))}
          </div>
        ) : (
          <article className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {guardMarkdownDelimiters(extraction.markdown ?? "").text}
            </ReactMarkdown>
          </article>
        )}
        {extraction.markdown.trim() === "" && (
          <p className="text-xs text-muted-foreground">
            No text content found in {fileName ?? "this document"}.
          </p>
        )}
      </div>
    </div>
  );
}

export default OfficePreview;
