"use client";

/**
 * PdfStudioReader — three synced reading panes.
 *
 *   ┌──────────────────┬──────────────────┬──────────────────┐
 *   │ Source PDF       │ Raw extraction   │ AI-cleaned       │
 *   │ (iframe + #page) │ per-page anchors │ per-page anchors │
 *   │                  │ + section chips  │ + section chips  │
 *   └──────────────────┴──────────────────┴──────────────────┘
 *
 * The caller passes:
 *   - `pages` (per-page rows from `processed_document_pages`).
 *   - `activePage` — currently most-visible page number.
 *   - `onActivePage(n)` — emitted when scrolling drives a new active page.
 *   - `pendingScrollPage` — when set, all panes scroll to that page once
 *     and clear the pending state via `onScrollHandled`.
 *
 * Scroll sync is one-directional from whichever text pane the user is
 * actively scrolling (the most-visible page-anchor wins). The PDF iframe
 * follows via `#page=N`. The other text pane follows by `scrollIntoView`
 * on the matching anchor — without re-emitting the page, so we don't
 * fight ourselves.
 *
 * Density / pane visibility is owned by the caller so power users can
 * collapse a pane via keyboard.
 */

import React, { useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  FileText,
  MousePointerClick,
  Loader2,
  Eye,
  EyeOff,
  AlertTriangle,
  Wand2,
  ExternalLink,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// react-pdf + pdfjs-dist is ~400KB; defer both viewers until they mount.
const PdfStudioUrlViewer = dynamic(() => import("./PdfStudioUrlViewer"), {
  ssr: false,
  loading: () => <PdfPaneLoading />,
});

// Shared renderer used by PdfCldFileViewer below.
const PdfDocumentRenderer = dynamic(
  () =>
    import(
      "@/features/files/components/core/FilePreview/previewers/PdfDocumentRenderer"
    ),
  { ssr: false, loading: () => <PdfPaneLoading /> },
);

function PdfPaneLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="w-5 h-5 text-muted-foreground/60 animate-spin" />
    </div>
  );
}

/**
 * Viewer for docs whose source is a `cld_files` row.
 *
 * `processed_documents.storage_uri` is stored as an `s3://` protocol URI
 * that the Python backend uses internally — it can't be fetched from a
 * browser directly. When `source_kind = 'cld_file'` the correct path is
 * to proxy through the Python `/files/{id}/download` endpoint, which is
 * exactly what `useFileBlob` does.
 */
function PdfCldFileViewer({
  fileId,
  fileName,
  pageNumber,
  onPageChange,
}: {
  fileId: string;
  fileName?: string | null;
  pageNumber?: number;
  onPageChange?: (page: number) => void;
}) {
  const { url, loading, error, bytesLoaded, bytesTotal } = useFileBlob(fileId);
  return (
    <PdfDocumentRenderer
      blobUrl={url}
      fileName={fileName ?? null}
      loading={loading}
      bytesLoaded={bytesLoaded}
      bytesTotal={bytesTotal}
      error={error}
      pageNumber={pageNumber}
      onPageChange={onPageChange}
      className="border-0"
    />
  );
}
import { cn } from "@/lib/utils";
import { useFileBlob } from "@/features/files/hooks/useFileBlob";
import type { PdfDocument } from "../hooks/usePdfExtractor";
import type { PdfPageRow } from "../hooks/useProcessedDocumentPages";

export type PaneKey = "pdf" | "raw" | "clean";

export interface PdfStudioReaderProps {
  doc: PdfDocument;
  pages: PdfPageRow[];
  loading: boolean;
  error: string | null;
  activePage: number | null;
  onActivePage: (page: number | null) => void;
  pendingScrollPage: number | null;
  onScrollHandled: () => void;
  visiblePanes: Set<PaneKey>;
  onTogglePane: (pane: PaneKey) => void;
  /** Active find query — every match in the visible text panes is highlighted. */
  findQuery: string;
  /** Called when the user wants to re-run the full pipeline on this doc. */
  onRunPipeline: () => void | Promise<unknown>;
  pipelineRunning: boolean;
  /** Called when the user wants to open the upload drawer (e.g. to refresh a missing source). */
  onOpenUpload: () => void;
}

export function PdfStudioReader({
  doc,
  pages,
  loading,
  error,
  activePage,
  onActivePage,
  pendingScrollPage,
  onScrollHandled,
  visiblePanes,
  onTogglePane,
  findQuery,
  onRunPipeline,
  pipelineRunning,
  onOpenUpload,
}: PdfStudioReaderProps) {
  const hasPages = pages.length > 0;
  // True when per-page rows exist but every row's text is empty — typically
  // because an older pipeline run created page stubs without persisting the
  // extracted text. We fall back to the aggregate `content` / `clean_content`
  // and surface a re-run CTA.
  const allPagesEmpty = useMemo(
    () =>
      pages.length > 0 &&
      pages.every((p) => !p.rawText.trim() && !p.cleanedText.trim()),
    [pages],
  );

  // Each text pane registers its own scroll container. Whichever one the
  // user touched most recently is allowed to drive sync — the other
  // follows via `scrollIntoView`. `lastScrolledPaneRef` is a non-state
  // ref because we don't want to re-render to track focus.
  const lastScrolledPaneRef = useRef<PaneKey | null>(null);

  // The PDF viewer (PdfPreview) is driven via its `pageNumber` prop —
  // see `PdfPane` below. No iframe ref needed.

  if (loading && !hasPages) {
    return <ReaderSkeleton visiblePanes={visiblePanes} />;
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!hasPages) {
    return <LegacyReaderFallback doc={doc} />;
  }

  return (
    <div className="flex flex-1 min-h-0">
      {visiblePanes.has("pdf") && (
        <PdfPane
          doc={doc}
          activePage={activePage}
          onActivePage={onActivePage}
          onTogglePane={() => onTogglePane("pdf")}
          onOpenUpload={onOpenUpload}
        />
      )}
      {visiblePanes.has("raw") && (
        <TextPane
          paneKey="raw"
          title="Raw extraction"
          subtitle="System A · per-page"
          icon={<FileText className="w-3 h-3 text-muted-foreground" />}
          doc={doc}
          pages={pages}
          field="raw"
          activePage={activePage}
          onActivePage={onActivePage}
          pendingScrollPage={pendingScrollPage}
          onScrollHandled={onScrollHandled}
          lastScrolledPaneRef={lastScrolledPaneRef}
          findQuery={findQuery}
          onTogglePane={() => onTogglePane("raw")}
          allPagesEmpty={allPagesEmpty}
          onRunPipeline={onRunPipeline}
          pipelineRunning={pipelineRunning}
        />
      )}
      {visiblePanes.has("clean") && (
        <TextPane
          paneKey="clean"
          title="AI-cleaned"
          subtitle="System B · per-page"
          icon={<MousePointerClick className="w-3 h-3 text-primary" />}
          doc={doc}
          pages={pages}
          field="cleaned"
          activePage={activePage}
          onActivePage={onActivePage}
          pendingScrollPage={pendingScrollPage}
          onScrollHandled={onScrollHandled}
          lastScrolledPaneRef={lastScrolledPaneRef}
          findQuery={findQuery}
          onTogglePane={() => onTogglePane("clean")}
          highlightSection
          allPagesEmpty={allPagesEmpty}
          onRunPipeline={onRunPipeline}
          pipelineRunning={pipelineRunning}
        />
      )}
    </div>
  );
}

// ── PDF pane ──────────────────────────────────────────────────────────────

function PdfPane({
  doc,
  activePage,
  onActivePage,
  onTogglePane,
  onOpenUpload,
}: {
  doc: PdfDocument;
  activePage: number | null;
  onActivePage: (page: number | null) => void;
  onTogglePane: () => void;
  onOpenUpload: () => void;
}) {
  // Drive the viewer's controlled page from the studio. The viewer also
  // emits onPageChange when the user uses its own toolbar prev/next.
  const onViewerPageChange = useCallback(
    (page: number) => onActivePage(page),
    [onActivePage],
  );

  return (
    <section className="flex-1 min-w-0 flex flex-col border-r border-border bg-muted/10">
      <PaneHeader
        title="Source PDF"
        subtitle={activePage != null ? `page ${activePage}` : ""}
        icon={<FileText className="w-3 h-3 text-muted-foreground" />}
        onTogglePane={onTogglePane}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        {doc.sourceKind === "cld_file" && doc.sourceId ? (
          // The `storage_uri` is an `s3://` URI — not a browser-fetchable
          // URL. Route through the Python download proxy instead.
          <PdfCldFileViewer
            fileId={doc.sourceId}
            fileName={doc.name}
            pageNumber={activePage ?? 1}
            onPageChange={onViewerPageChange}
          />
        ) : doc.source && !doc.source.startsWith("s3://") ? (
          <PdfStudioUrlViewer
            url={doc.source}
            fileName={doc.name}
            pageNumber={activePage ?? 1}
            onPageChange={onViewerPageChange}
            className="border-0"
          />
        ) : (
          <PdfPaneEmptyState doc={doc} onOpenUpload={onOpenUpload} />
        )}
      </div>
    </section>
  );
}

function PdfPaneEmptyState({
  doc,
  onOpenUpload,
}: {
  doc: PdfDocument;
  onOpenUpload: () => void;
}) {
  // No `storage_uri` on this row — most likely a legacy doc that was
  // backfilled into `processed_documents` without its source URL. The user
  // needs a real action, not just an error message.
  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="max-w-sm text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/15 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            No source PDF linked to this record
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            This document predates the new ingestion pipeline, so the original
            file isn't reachable from a stored URL. The extracted text on the
            right is still yours — re-upload the same PDF to relink it for
            side-by-side viewing.
          </p>
        </div>
        <div className="flex flex-col gap-2 items-center">
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={onOpenUpload}
          >
            <Upload className="w-3.5 h-3.5" />
            Re-upload to relink
          </Button>
          <p className="text-[10px] text-muted-foreground/70 font-mono">
            sourceKind: {doc.sourceKind ?? "(null)"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Text pane (raw or cleaned) ────────────────────────────────────────────

function TextPane({
  paneKey,
  title,
  subtitle,
  icon,
  doc,
  pages,
  field,
  activePage,
  onActivePage,
  pendingScrollPage,
  onScrollHandled,
  lastScrolledPaneRef,
  findQuery,
  onTogglePane,
  highlightSection,
  allPagesEmpty,
  onRunPipeline,
  pipelineRunning,
}: {
  paneKey: PaneKey;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  doc: PdfDocument;
  pages: PdfPageRow[];
  field: "raw" | "cleaned";
  activePage: number | null;
  onActivePage: (page: number) => void;
  pendingScrollPage: number | null;
  onScrollHandled: () => void;
  lastScrolledPaneRef: React.MutableRefObject<PaneKey | null>;
  findQuery: string;
  onTogglePane: () => void;
  highlightSection?: boolean;
  allPagesEmpty: boolean;
  onRunPipeline: () => void | Promise<unknown>;
  pipelineRunning: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const anchorMap = useRef<Map<number, HTMLElement>>(new Map());

  // Track when this pane is the active scroller — so the IntersectionObserver
  // only emits while the user is actually interacting with it.
  const onScrollStart = useCallback(() => {
    lastScrolledPaneRef.current = paneKey;
  }, [paneKey, lastScrolledPaneRef]);

  // IntersectionObserver — emit the most-visible page only when this pane
  // is the active scroller. The PDF + the sibling text pane will follow.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (lastScrolledPaneRef.current !== paneKey) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const page = Number(visible.target.getAttribute("data-page") ?? 0);
        if (page) onActivePage(page);
      },
      { root, threshold: [0.25, 0.5, 0.75] },
    );
    anchorMap.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pages.length, paneKey, lastScrolledPaneRef, onActivePage]);

  // Programmatic scroll when an external action sets `pendingScrollPage`
  // (toolbar PageJumper, sibling pane click, sidebar nav).
  useEffect(() => {
    if (pendingScrollPage == null) return;
    const el = anchorMap.current.get(pendingScrollPage);
    if (el) {
      // Don't let the resulting scroll reclassify this as the active pane.
      const wasLast = lastScrolledPaneRef.current;
      el.scrollIntoView({ block: "start", behavior: "smooth" });
      lastScrolledPaneRef.current = wasLast;
    }
    // Clear the pending state — we let the toolbar know it can re-issue.
    onScrollHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingScrollPage]);

  // When ALL per-page rows are empty, fall back to the aggregate text that
  // lives on `processed_documents` itself — that's what the pipeline writes
  // into `content` / `clean_content`. This is the path that makes the
  // "blank page 1, page 2 …" state actionable instead of frustrating.
  const aggregateText =
    field === "cleaned" ? (doc.cleanContent ?? "") : (doc.content ?? "");

  return (
    <section className="flex-1 min-w-0 flex flex-col border-r last:border-r-0 border-border">
      <PaneHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        onTogglePane={onTogglePane}
      />

      {allPagesEmpty && (
        <BlankPagesBanner
          docHasAggregate={!!aggregateText}
          field={field}
          onRunPipeline={onRunPipeline}
          pipelineRunning={pipelineRunning}
        />
      )}

      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-2"
        onScroll={onScrollStart}
        onWheel={onScrollStart}
        onTouchMove={onScrollStart}
      >
        {allPagesEmpty && aggregateText && (
          // Surface the aggregate document text so the user can actually
          // read what's there. We render it as a single block, NOT as N
          // empty page rows, since per-page persistence didn't work.
          <div className="border border-border bg-card rounded-md p-2.5">
            <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-muted-foreground">
              <span className="font-mono font-semibold text-foreground/80">
                Document text (aggregate)
              </span>
              <span className="ml-auto font-mono">
                {aggregateText.length.toLocaleString()} chars
              </span>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/85">
              <Highlighted text={aggregateText} query={findQuery} />
            </pre>
          </div>
        )}

        {pages.map((p) => {
          // Skip per-page rows when the whole set is empty — they'd just
          // print "no text on this page" N times.
          if (allPagesEmpty) return null;
          const text = field === "cleaned" ? p.cleanedText : p.rawText;
          const isActive = activePage === p.pageNumber;
          return (
            <PageBlock
              key={p.id}
              page={p}
              text={text}
              field={field}
              isActive={isActive}
              highlightSection={highlightSection}
              findQuery={findQuery}
              onClick={() => onActivePage(p.pageNumber)}
              registerAnchor={(el) => {
                if (el) anchorMap.current.set(p.pageNumber, el);
                else anchorMap.current.delete(p.pageNumber);
              }}
            />
          );
        })}
      </div>
    </section>
  );
}

function BlankPagesBanner({
  docHasAggregate,
  field,
  onRunPipeline,
  pipelineRunning,
}: {
  docHasAggregate: boolean;
  field: "raw" | "cleaned";
  onRunPipeline: () => void | Promise<unknown>;
  pipelineRunning: boolean;
}) {
  return (
    <div className="shrink-0 mx-2 mt-2 border border-amber-500/30 bg-amber-500/5 rounded-md p-2.5 text-[11px] text-amber-700 dark:text-amber-400">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-medium">
            Per-page rows exist for this doc, but every page is empty.
          </p>
          <p className="mt-0.5 text-amber-700/90 dark:text-amber-300/80 leading-snug">
            {docHasAggregate
              ? "Showing the aggregate document text below as a fallback. Re-run the pipeline to populate per-page rows so synced scrolling and word-level highlighting work."
              : `No ${field === "cleaned" ? "cleaned" : "raw"} text was persisted. Re-run the pipeline to repopulate.`}
          </p>
          <div className="mt-1.5">
            <Button
              size="sm"
              className="h-7 text-[11px] gap-1"
              onClick={() => void onRunPipeline()}
              disabled={pipelineRunning}
            >
              {pipelineRunning ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Re-running…
                </>
              ) : (
                <>
                  <Wand2 className="w-3 h-3" />
                  Re-run pipeline
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page block — one row per page in a text pane ──────────────────────────

function PageBlock({
  page,
  text,
  field,
  isActive,
  highlightSection,
  findQuery,
  onClick,
  registerAnchor,
}: {
  page: PdfPageRow;
  text: string;
  field: "raw" | "cleaned";
  isActive: boolean;
  highlightSection?: boolean;
  findQuery: string;
  onClick: () => void;
  registerAnchor: (el: HTMLDivElement | null) => void;
}) {
  const charCount =
    field === "cleaned" ? page.cleanedCharCount : page.rawCharCount;

  return (
    <div
      data-page={page.pageNumber}
      ref={registerAnchor}
      onClick={onClick}
      className={cn(
        "border rounded-md p-2 text-[11px] leading-relaxed transition-colors cursor-pointer",
        isActive
          ? "border-primary/50 bg-primary/5 shadow-sm"
          : "border-border bg-card hover:bg-accent/30",
      )}
    >
      <div className="flex items-center gap-1.5 mb-1 text-[10px] text-muted-foreground">
        <span className="font-mono font-semibold text-foreground/80">
          page {page.pageNumber}
        </span>
        {page.usedOcr && (
          <span className="px-1 py-px rounded bg-amber-500/10 text-amber-700 dark:text-amber-400">
            OCR
          </span>
        )}
        {highlightSection && page.sectionKind && (
          <span className="px-1 py-px rounded bg-primary/10 text-primary truncate max-w-[160px]">
            {page.sectionKind}
            {page.sectionTitle && ` · ${page.sectionTitle}`}
          </span>
        )}
        <span className="ml-auto font-mono">{charCount.toLocaleString()}</span>
      </div>
      <pre className="whitespace-pre-wrap font-mono text-foreground/85 leading-relaxed">
        <Highlighted text={text} query={findQuery} />
      </pre>
    </div>
  );
}

// ── Inline find-highlight ─────────────────────────────────────────────────

function Highlighted({ text, query }: { text: string; query: string }) {
  const segments = useMemo(() => {
    if (!query.trim() || !text) return [{ text, match: false }];
    const q = query.trim();
    const lower = text.toLowerCase();
    const lq = q.toLowerCase();
    const out: { text: string; match: boolean }[] = [];
    let i = 0;
    while (i < text.length) {
      const at = lower.indexOf(lq, i);
      if (at < 0) {
        out.push({ text: text.slice(i), match: false });
        break;
      }
      if (at > i) out.push({ text: text.slice(i, at), match: false });
      out.push({ text: text.slice(at, at + q.length), match: true });
      i = at + q.length;
    }
    return out;
  }, [text, query]);

  if (segments.length === 1 && !segments[0].match) {
    return (
      <>
        {segments[0].text || (
          <span className="italic text-muted-foreground">
            (no text on this page)
          </span>
        )}
      </>
    );
  }

  return (
    <>
      {segments.map((s, i) =>
        s.match ? (
          <mark
            key={i}
            className="rounded bg-amber-300/40 text-foreground px-0.5"
          >
            {s.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </>
  );
}

// ── Pane header (shared) ──────────────────────────────────────────────────

function PaneHeader({
  title,
  subtitle,
  icon,
  onTogglePane,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onTogglePane?: () => void;
}) {
  return (
    <div className="shrink-0 px-2.5 py-1.5 border-b border-border flex items-center gap-1.5">
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
        {title}
      </span>
      {subtitle && (
        <span className="text-[10px] text-muted-foreground">· {subtitle}</span>
      )}
      {onTogglePane && (
        <button
          type="button"
          onClick={onTogglePane}
          className="ml-auto p-0.5 text-muted-foreground/60 hover:text-foreground rounded transition-colors"
          title="Hide pane"
        >
          <EyeOff className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ── Loading + legacy fallback ─────────────────────────────────────────────

function ReaderSkeleton({ visiblePanes }: { visiblePanes: Set<PaneKey> }) {
  return (
    <div className="flex flex-1 min-h-0">
      {Array.from(visiblePanes).map((pane) => (
        <div
          key={pane}
          className="flex-1 min-w-0 flex flex-col border-r last:border-r-0 border-border p-3 gap-2"
        >
          <div className="h-5 w-32 rounded bg-muted/50 animate-pulse" />
          <div className="h-32 w-full rounded bg-muted/40 animate-pulse" />
          <div className="h-32 w-full rounded bg-muted/40 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function LegacyReaderFallback({ doc }: { doc: PdfDocument }) {
  return (
    <div className="flex flex-1 min-h-0">
      {/* PDF pane — use the proper renderer, not an iframe */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-border bg-muted/10">
        <div className="shrink-0 px-2.5 py-1.5 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Source PDF
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {doc.sourceKind === "cld_file" && doc.sourceId ? (
            <PdfCldFileViewer fileId={doc.sourceId} fileName={doc.name} />
          ) : doc.source && !doc.source.startsWith("s3://") ? (
            <PdfStudioUrlViewer url={doc.source} fileName={doc.name} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <p className="text-[11px] text-muted-foreground">
                No source PDF linked to this record.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Text pane */}
      <div className="flex-1 min-w-0 flex flex-col p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
          Document content (no per-page rows yet)
        </div>
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-md p-3 mb-3 text-[11px] text-amber-700 dark:text-amber-400">
          Run the pipeline from the toolbar above to populate
          <code className="mx-1 px-1 bg-card border border-border rounded text-[10px]">
            processed_document_pages
          </code>
          and unlock synced scrolling, find-in-doc, and bbox overlays.
        </div>
        <pre className="flex-1 min-h-0 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/85">
          {doc.cleanContent ?? doc.content ?? "(no extracted text)"}
        </pre>
      </div>
    </div>
  );
}
