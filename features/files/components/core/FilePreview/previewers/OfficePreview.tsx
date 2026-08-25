/**
 * features/files/components/core/FilePreview/previewers/OfficePreview.tsx
 *
 * Word / PowerPoint previewer — two modes over server-side machinery:
 *
 *  - **Visual** ("Slides" for decks, "Pages" for documents): the server's
 *    idempotent LibreOffice lane (`POST /office/{id}/convert`) returns the
 *    cached `pdf_conversion` derivative of the file — a real files row —
 *    which renders through the canonical `PdfPreview` (react-pdf, progressive
 *    Range loading). Uploads warm this derivative server-side, so it is
 *    usually an instant cache hit. Decks default to Visual (a deck IS its
 *    look); Word documents default to Text (instant, reads better small).
 *
 *  - **Text**: `GET /office/{file_id}/markdown` (the matrx-files Office
 *    codec, with the LibreOffice bridge for legacy .doc/.ppt) rendered as
 *    formatted markdown. Decks render slide-by-slide with titled dividers —
 *    the divider owns the slide's number/title, so each portion's own
 *    duplicate heading is stripped for display
 *    (`stripDuplicatePortionHeading`); the codec keeps emitting it, because
 *    the whole-document markdown needs it.
 *
 * The source bytes never reach the browser — only the derived PDF streams.
 * Both the extraction and the PDF FileRef are cached at module level
 * (office-extraction-cache.ts) so reopening the preview pane is instant.
 *
 * DELIBERATE standalone react-markdown (same reasoning as MarkdownPreview):
 * this module is only entered via the lazy previewer edge, so the markdown
 * stack's weight stays inside the previewer chunk — and it must NOT pull the
 * shared MarkdownCore chunk that chat surfaces stream through. PdfPreview is
 * a React.lazy in-gate edge to the SAME module PreviewerSwitch lazy-loads,
 * so both resolve to one shared react-pdf chunk (Fragmentation Law: no new
 * next/dynamic loadable).
 */

"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Copy,
  FileText,
  Loader2,
  Presentation,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { guardMarkdownDelimiters } from "@/lib/markdown/delimiter-guard";
import { stripDuplicatePortionHeading } from "@/lib/markdown/portion-heading";
import type {
  OfficeExtraction,
  OfficeFileRef,
  OfficePortion,
} from "@/features/files/api/office";
// Caches live OUTSIDE this lazy chunk so upload/restore/delete thunks and the
// realtime middleware can invalidate them without importing this graph.
import {
  getOfficeExtraction,
  getOfficePdf,
  peekOfficeExtraction,
  peekOfficePdf,
} from "@/features/files/hooks/office-extraction-cache";
import { useFileAsset } from "@/features/files/hooks/useFileAsset";
import { extractErrorMessage } from "@/utils/errors";

const PdfPreview = lazy(() => import("./PdfPreview"));

const KIND_LABEL: Record<string, string> = {
  docx: "Word document",
  doc: "Word document (legacy)",
  pptx: "PowerPoint",
  ppt: "PowerPoint (legacy)",
  xlsx: "Excel workbook",
  xls: "Excel workbook (legacy)",
};

type ViewMode = "visual" | "text";

/** Deck-ness from the filename, so the default mode is right on FIRST paint
 *  (the extraction's office_kind arrives async and only ever agrees). */
function isDeckFileName(fileName: string | undefined): boolean {
  return /\.pptm?x?$|\.ppt$/i.test(fileName ?? "");
}

/**
 * One slide card: the divider IS the slide's title row, so the portion's own
 * leading "Slide N: <title>" heading is dropped when it would repeat it —
 * defensively, leaving any heading that carries real content in place.
 */
function SlideCard({
  slide,
  onView,
}: {
  slide: OfficePortion;
  /** Jump to this slide in the visual mode (extracted text ↔ source link). */
  onView?: (slideNumber: number) => void;
}) {
  const body = stripDuplicatePortionHeading(slide.markdown, {
    label: "Slide",
    number: slide.number,
    title: slide.title,
  }).trim();

  return (
    <section className="group rounded-lg border border-border bg-background/40 px-5 py-4">
      <div className="mb-2 flex items-baseline gap-2 border-b border-border/60 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Slide {slide.number}
        </span>
        {slide.title && (
          <span className="truncate text-xs font-medium text-foreground">
            {slide.title}
          </span>
        )}
        {onView && (
          <button
            type="button"
            onClick={() => onView(slide.number)}
            aria-label={`View slide ${slide.number}`}
            title="View this slide"
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Presentation className="h-3 w-3" />
            View
          </button>
        )}
      </div>
      {body ? (
        <article className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {guardMarkdownDelimiters(body).text}
          </ReactMarkdown>
        </article>
      ) : (
        // A title-only slide: stripping its heading leaves nothing, and an
        // empty card body reads as a rendering failure.
        <p className="text-xs italic text-muted-foreground">
          No additional text on this slide.
        </p>
      )}
    </section>
  );
}

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
  const deck = isDeckFileName(fileName);

  // State is keyed by fileId and reset DURING RENDER when the file changes
  // (the React-sanctioned "adjust state when props change" pattern) — the
  // effects below only perform async fetches, never synchronous setState.
  const [state, setState] = useState<{
    fileId: string;
    extraction: OfficeExtraction | null;
    error: string | null;
    mode: ViewMode;
    pdfRef: OfficeFileRef | null;
    pdfError: string | null;
    page: number;
  }>(() => ({
    fileId,
    extraction: peekOfficeExtraction(fileId),
    error: null,
    mode: deck ? "visual" : "text",
    pdfRef: peekOfficePdf(fileId),
    pdfError: null,
    page: 1,
  }));
  if (state.fileId !== fileId) {
    setState({
      fileId,
      extraction: peekOfficeExtraction(fileId),
      error: null,
      mode: deck ? "visual" : "text",
      pdfRef: peekOfficePdf(fileId),
      pdfError: null,
      page: 1,
    });
  }
  const [copied, setCopied] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  const mode = state.fileId === fileId ? state.mode : deck ? "visual" : "text";
  const { asset, refresh: refreshSourceAsset } = useFileAsset(
    deck ? fileId : null,
    { signedUrlTtl: 3600 },
  );
  const sourceAsset = asset?.file_id === fileId ? asset : null;
  const firstSlideUrl =
    sourceAsset?.variants?.page1_url?.url ??
    sourceAsset?.variants?.thumbnail_url?.url ??
    null;
  const [firstSlideImage, setFirstSlideImage] = useState<{
    url: string | null;
    failed: boolean;
  }>({ url: firstSlideUrl, failed: false });
  if (firstSlideImage.url !== firstSlideUrl) {
    setFirstSlideImage({ url: firstSlideUrl, failed: false });
  }

  useEffect(() => {
    // Visual mode does not need the source extraction. On very large decks,
    // extracting the 80–90 MB PPTX while LibreOffice is rendering the PDF
    // downloads and parses the source twice and makes both jobs slower. Load
    // markdown only when the user actually opens Text mode.
    if (mode !== "text") return;
    // Always go through getOfficeExtraction: a cache hit resolves instantly
    // (async .then — no sync setState), an in-flight fetch is shared, a miss
    // fetches. This also covers the parallel-mount race where another
    // instance fills the cache between our render and this effect.
    let cancelled = false;
    getOfficeExtraction(fileId)
      .then((result) => {
        if (cancelled) return;
        setState((s) =>
          s.fileId === fileId && s.extraction !== result
            ? { ...s, extraction: result, error: null }
            : s,
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
  }, [fileId, mode, retryToken]);

  useEffect(() => {
    // Resolve the PDF derivative only when the visual mode wants it. The
    // server lane is idempotent + upload-warmed, so this is usually a fast
    // cache hit; a genuine conversion (older file) takes a few seconds once.
    if (mode !== "visual") return;
    let cancelled = false;
    getOfficePdf(fileId)
      .then((ref) => {
        if (cancelled) return;
        setState((s) =>
          s.fileId === fileId && s.pdfRef !== ref
            ? { ...s, pdfRef: ref, pdfError: null }
            : s,
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setState((s) =>
          s.fileId === fileId
            ? {
                ...s,
                pdfError:
                  extractErrorMessage(err) ||
                  "Couldn't render this document visually",
              }
            : s,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, mode, retryToken]);

  const extraction = state.fileId === fileId ? state.extraction : null;
  const error = state.fileId === fileId ? state.error : null;
  const pdfRef = state.fileId === fileId ? state.pdfRef : null;
  const pdfError = state.fileId === fileId ? state.pdfError : null;

  useEffect(() => {
    // The full-res first-slide variant is produced independently during
    // upload. It can appear while the cached full-deck PDF is still warming,
    // so refresh the small Asset envelope until either representation lands.
    if (mode !== "visual" || pdfRef || firstSlideUrl) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      await refreshSourceAsset();
      if (!cancelled) timer = setTimeout(() => void poll(), 2_500);
    };
    timer = setTimeout(() => void poll(), 1_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [firstSlideUrl, mode, pdfRef, refreshSourceAsset]);

  const setMode = useCallback((next: ViewMode) => {
    setState((s) => (s.mode === next ? s : { ...s, mode: next }));
  }, []);

  // Extracted text ↔ source link (the same connection PDFs keep): a slide
  // card in Text mode jumps to that slide in the visual render. Slide
  // number ↔ PDF page is 1:1 for decks — the conversion is page-per-slide.
  const viewSlide = useCallback((slideNumber: number) => {
    setState((s) => ({ ...s, mode: "visual", page: slideNumber }));
  }, []);

  const onPageChange = useCallback((page: number) => {
    setState((s) => (s.page === page ? s : { ...s, page }));
  }, []);

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

  // A hard extraction failure only blocks the TEXT mode — the visual mode
  // renders from the PDF derivative and may still work (and vice versa).
  if (error && mode === "text") {
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

  const kindLabel = extraction
    ? (KIND_LABEL[extraction.office_kind] ??
      extraction.office_kind.toUpperCase())
    : deck
      ? "PowerPoint"
      : "Document";
  const isDeck = extraction
    ? extraction.office_kind === "pptx" || extraction.office_kind === "ppt"
    : deck;
  const slides = isDeck ? (extraction?.portions ?? []) : [];
  const warnings = extraction?.warnings ?? [];
  const visualLabel = isDeck ? "Slides" : "Pages";

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
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            className="inline-flex overflow-hidden rounded-md border"
            role="tablist"
            aria-label="Preview mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "visual"}
              onClick={() => setMode("visual")}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium",
                mode === "visual"
                  ? "bg-accent text-foreground"
                  : "bg-background text-muted-foreground hover:bg-accent/50",
              )}
            >
              <Presentation className="h-3 w-3" />
              {visualLabel}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "text"}
              onClick={() => setMode("text")}
              className={cn(
                "inline-flex items-center gap-1 border-l px-2 py-0.5 text-[11px] font-medium",
                mode === "text"
                  ? "bg-accent text-foreground"
                  : "bg-background text-muted-foreground hover:bg-accent/50",
              )}
            >
              <FileText className="h-3 w-3" />
              Text
            </button>
          </span>
          {mode === "text" && (
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
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? "Copied" : "Copy markdown"}
            </button>
          )}
        </span>
      </div>
      {mode === "visual" ? (
        pdfError ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
            role="alert"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">
                Couldn&apos;t render this {isDeck ? "deck" : "document"}{" "}
                visually
              </h3>
              <p className="max-w-md text-xs text-muted-foreground break-words">
                {pdfError}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setState((s) => ({ ...s, pdfError: null }));
                  setRetryToken((t) => t + 1);
                }}
                className="rounded-md border bg-background px-3 py-1 text-xs font-medium hover:bg-accent"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => setMode("text")}
                className="rounded-md border bg-background px-3 py-1 text-xs font-medium hover:bg-accent"
              >
                View extracted text
              </button>
            </div>
          </div>
        ) : pdfRef ? (
          <Suspense
            fallback={
              <div className="flex flex-1 flex-col items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <PdfPreview
              fileId={pdfRef.file_id}
              className="flex-1 min-h-0"
              pageNumber={state.fileId === fileId ? state.page : 1}
              onPageChange={onPageChange}
              pageLabel={isDeck ? "slide" : "page"}
              floatingPageControls={isDeck}
            />
          </Suspense>
        ) : (
          <div
            className="relative flex flex-1 items-center justify-center overflow-hidden bg-muted/20 p-4"
            role="status"
            aria-label={`Preparing ${fileName ?? (isDeck ? "presentation" : "document")}`}
          >
            {firstSlideImage.url && !firstSlideImage.failed ? (
              // The source asset's full-resolution page1_url is the earliest
              // faithful visual. It stays visible until the range-ready PDF
              // derivative replaces it; no blank full-file download gate.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={firstSlideImage.url}
                alt={isDeck ? "First slide preview" : "First page preview"}
                draggable={false}
                onError={() =>
                  setFirstSlideImage((current) => ({
                    ...current,
                    failed: true,
                  }))
                }
                className="max-h-full max-w-full rounded-md border border-border/60 object-contain shadow-sm"
              />
            ) : (
              <div className="aspect-video w-full max-w-4xl animate-pulse rounded-lg border border-border/70 bg-card shadow-sm">
                <div className="flex h-full flex-col gap-4 p-[7%]">
                  <div className="h-[10%] w-2/5 rounded bg-muted" />
                  <div className="h-[5%] w-4/5 rounded bg-muted/70" />
                  <div className="h-[5%] w-3/5 rounded bg-muted/70" />
                  <div className="mt-auto h-[38%] rounded bg-muted/40" />
                </div>
              </div>
            )}
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-glass-edge bg-glass px-3 py-2 text-xs font-medium text-foreground shadow-glass backdrop-blur-glass backdrop-saturate-glass">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              Preparing remaining {isDeck ? "slides" : "pages"}…
            </div>
          </div>
        )
      ) : !extraction ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Reading document…
          </span>
        </div>
      ) : (
        <div className="flex-1 overflow-auto px-6 py-5">
          {isDeck && slides.length > 0 ? (
            <div className="space-y-6">
              {slides.map((slide) => (
                <SlideCard key={slide.index} slide={slide} onView={viewSlide} />
              ))}
            </div>
          ) : (
            <article className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {guardMarkdownDelimiters(extraction.markdown ?? "").text}
              </ReactMarkdown>
            </article>
          )}
          {(extraction.markdown ?? "").trim() === "" && (
            <p className="text-xs text-muted-foreground">
              No text content found in {fileName ?? "this document"}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default OfficePreview;
