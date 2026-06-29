"use client";

/**
 * SyncedPdfTextView — three-pane view (PDF · raw text per page · cleaned
 * markdown per page) with the PDF on the left and per-page text rows on
 * the right.
 *
 *   ┌──────────────────────┬──────────────────────┬──────────────────────┐
 *   │ Source PDF           │ Raw extraction       │ AI-cleaned markdown  │
 *   │ (iframe today)       │ per page             │ per page             │
 *   └──────────────────────┴──────────────────────┴──────────────────────┘
 *
 * Rows come from `processed_document_pages` via `useProcessedDocumentPages`.
 * Joined scrolling: an `IntersectionObserver` on per-page anchors in the
 * text columns drives `pdfRef.contentWindow.location.hash = '#page=N'`,
 * which the PDF-rendering iframe honours.
 *
 * Legacy documents (extracted before per-page persistence shipped) return
 * zero pages from the backend; the panel surfaces a clear re-process CTA
 * instead of leaving the panes empty.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FileText,
  Flame,
  Loader2,
  AlertCircle,
  Layers,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PdfDocument } from "../hooks/usePdfExtractor";
import {
  useProcessedDocumentPages,
  type PdfPageRow,
} from "../hooks/useProcessedDocumentPages";

interface SyncedPdfTextViewProps {
  doc: PdfDocument;
  /** Triggers re-processing of the source so per-page rows get populated. */
  onReprocess?: () => void;
  /** True while re-processing is in flight; disables the CTA. */
  reprocessing?: boolean;
}

export function SyncedPdfTextView({
  doc,
  onReprocess,
  reprocessing,
}: SyncedPdfTextViewProps) {
  const { pages, loading, error } = useProcessedDocumentPages({
    processedDocumentId: doc.id,
  });

  const pdfFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [activePage, setActivePage] = useState<number | null>(null);

  // Drive PDF iframe to the active page. Some PDF viewers honour the hash
  // fragment (`#page=N`) — Chrome's built-in does, react-pdf and pdf.js
  // need explicit calls. We do the cheap thing here and rely on the hash.
  useEffect(() => {
    if (!activePage || !pdfFrameRef.current || !doc.source) return;
    try {
      pdfFrameRef.current.src = `${doc.source}#page=${activePage}`;
    } catch {
      // ignore — cross-origin frames will throw, which is fine
    }
  }, [activePage, doc.source]);

  const hasPages = pages.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header / re-process CTA */}
      <div className="shrink-0 px-3 py-1.5 border-b border-border flex items-center gap-2">
        <Layers className="w-3 h-3 text-primary" />
        <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
          Synced View
        </span>
        <span className="text-[10px] text-muted-foreground">
          {loading
            ? "loading pages…"
            : hasPages
              ? `${pages.length.toLocaleString()} pages`
              : "no per-page data"}
        </span>
        {!hasPages && !loading && onReprocess && (
          <button
            type="button"
            onClick={onReprocess}
            disabled={reprocessing}
            className="ml-auto px-2 py-0.5 text-[10px] font-medium rounded border border-border bg-background hover:bg-accent disabled:opacity-50"
            title="Re-run extraction with per-page persistence"
          >
            {reprocessing ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Re-processing…
              </span>
            ) : (
              "Re-process to enable"
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="shrink-0 mx-3 my-2 text-[10px] text-destructive border border-destructive/30 bg-destructive/10 rounded px-2 py-1.5 flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" />
          {error}
        </div>
      )}

      {!hasPages && !loading && !error && <LegacyEmptyState doc={doc} />}

      {hasPages && (
        <div className="flex flex-1 min-h-0">
          {/* Pane 1 — Source PDF */}
          <div className="flex-1 min-w-0 flex flex-col border-r border-border bg-muted/10">
            <div className="shrink-0 px-2 py-1 border-b border-border flex items-center gap-1">
              <FileText className="w-3 h-3 text-muted-foreground" />
              <span className="text-[9px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                Source PDF
                {activePage != null && ` · page ${activePage}`}
              </span>
            </div>
            <div className="flex-1 min-h-0 p-2">
              {doc.source ? (
                <iframe
                  ref={pdfFrameRef}
                  src={doc.source}
                  title={doc.name}
                  className="w-full h-full border border-border rounded bg-background"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-[10px] text-muted-foreground">
                  No source URL on this document.
                </div>
              )}
            </div>
          </div>

          {/* Pane 2 — Raw text per page */}
          <PaneList
            title="Raw extraction"
            subtitle="System A · per-page"
            iconClass="text-muted-foreground"
            pages={pages}
            field="raw"
            activePage={activePage}
            onActivePage={setActivePage}
          />

          {/* Pane 3 — Cleaned markdown per page */}
          <PaneList
            title="AI-cleaned"
            subtitle="System B · per-page"
            iconClass="text-primary"
            pages={pages}
            field="cleaned"
            activePage={activePage}
            onActivePage={setActivePage}
            highlightSection
          />
        </div>
      )}
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function PaneList({
  title,
  subtitle,
  iconClass,
  pages,
  field,
  activePage,
  onActivePage,
  highlightSection,
}: {
  title: string;
  subtitle: string;
  iconClass?: string;
  pages: PdfPageRow[];
  field: "raw" | "cleaned";
  activePage: number | null;
  onActivePage: (page: number | null) => void;
  highlightSection?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // IntersectionObserver — when a per-page sentinel is most-visible, emit
  // the page number so the PDF iframe (and the sibling pane) can sync.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const page = Number(visible.target.getAttribute("data-page") ?? 0);
        if (page) onActivePage(page);
      },
      { root, threshold: [0.25, 0.5, 0.75] },
    );
    sentinelRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pages.length, onActivePage]);

  const Icon = field === "cleaned" ? Flame : FileText;

  return (
    <div className="flex-1 min-w-0 flex flex-col border-r last:border-r-0 border-border">
      <div className="shrink-0 px-2 py-1 border-b border-border flex items-center gap-1">
        <Icon className={cn("w-3 h-3", iconClass)} />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {title}
        </span>
        <span className="text-[9px] text-muted-foreground/60 ml-auto">
          {subtitle}
        </span>
      </div>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto px-2 py-1 space-y-2"
      >
        {pages.map((p) => {
          const text = field === "cleaned" ? p.cleanedText : p.rawText;
          const isActive = activePage === p.pageNumber;
          return (
            <div
              key={p.id}
              data-page={p.pageNumber}
              ref={(el) => {
                if (el) sentinelRefs.current.set(p.pageNumber, el);
                else sentinelRefs.current.delete(p.pageNumber);
              }}
              className={cn(
                "group border rounded-md p-2 text-[10px] leading-relaxed transition-colors cursor-pointer",
                isActive
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card hover:bg-accent/30",
              )}
              onClick={() => onActivePage(p.pageNumber)}
            >
              <div className="flex items-center gap-1.5 mb-1 text-[9px] text-muted-foreground">
                <span className="font-mono">page {p.pageNumber}</span>
                {p.usedOcr && (
                  <span className="px-1 py-px rounded bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    OCR
                  </span>
                )}
                {highlightSection && p.sectionKind && (
                  <span className="px-1 py-px rounded bg-primary/10 text-primary truncate max-w-[140px]">
                    {p.sectionKind}
                    {p.sectionTitle && ` · ${p.sectionTitle}`}
                  </span>
                )}
                <span className="ml-auto">
                  {(field === "cleaned"
                    ? p.cleanedCharCount
                    : p.rawCharCount
                  ).toLocaleString()}{" "}
                  chars
                </span>
                <CopyIconButton
                  getText={() => text}
                  label={`Copy page ${p.pageNumber}`}
                  hoverReveal
                />
              </div>
              <pre className="whitespace-pre-wrap font-mono text-foreground/80 leading-relaxed">
                {text || (
                  <span className="italic text-muted-foreground">
                    (no text on this page)
                  </span>
                )}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Small copy-to-clipboard icon button used inside the per-page card header.
 * `getText` is invoked at click time so it always copies the latest text.
 * `hoverReveal` keeps the button hidden until the closest `.group` ancestor
 * is hovered — used to avoid visual clutter on dense per-page rows.
 */
function CopyIconButton({
  getText,
  label,
  hoverReveal,
}: {
  getText: () => string;
  label: string;
  hoverReveal?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(getText());
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // ignore — clipboard permission denials are silent by design
      }
    },
    [getText],
  );
  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      aria-label={label}
      className={cn(
        "p-0.5 rounded transition-colors",
        copied
          ? "text-emerald-500"
          : "text-muted-foreground/60 hover:text-foreground hover:bg-accent",
        hoverReveal &&
          !copied &&
          "opacity-0 group-hover:opacity-100 transition-all",
        hoverReveal && copied && "opacity-100",
      )}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function LegacyEmptyState({ doc }: { doc: PdfDocument }) {
  const text = doc.cleanContent ?? doc.content ?? "";
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3">
      <div className="border border-amber-500/30 bg-amber-500/5 rounded-md p-3 mb-3 text-[11px] text-amber-700 dark:text-amber-400 space-y-1.5">
        <p className="font-medium">No per-page data for this document.</p>
        <p className="text-amber-600/90 dark:text-amber-300/80 leading-snug">
          This row was processed before the new per-page persistence shipped.
          Joined scrolling, word-level highlighting, and section-aware chunks
          activate once it's re-processed (a single new
          <code className="mx-1 px-1 bg-card border border-border rounded text-[10px]">
            processed_documents
          </code>
          row is created with
          <code className="mx-1 px-1 bg-card border border-border rounded text-[10px]">
            parent_processed_id
          </code>
          pointing back here, plus N
          <code className="mx-1 px-1 bg-card border border-border rounded text-[10px]">
            processed_document_pages
          </code>
          rows).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="border border-border rounded-md bg-card p-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <FileText className="w-3 h-3 text-muted-foreground" />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Document content (legacy)
            </span>
          </div>
          <pre className="text-[10px] font-mono whitespace-pre-wrap leading-relaxed text-foreground/80">
            {text.slice(0, 4000)}
            {text.length > 4000 && (
              <span className="text-muted-foreground">
                {" "}
                … ({(text.length - 4000).toLocaleString()} more chars)
              </span>
            )}
          </pre>
        </div>
        <div className="border border-border rounded-md bg-card p-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Flame className="w-3 h-3 text-primary" />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Source PDF
            </span>
          </div>
          {doc.source ? (
            <iframe
              src={doc.source}
              title={doc.name}
              className="w-full h-[420px] border border-border rounded bg-background"
            />
          ) : (
            <p className="text-[10px] text-muted-foreground italic">
              No source URL on this document.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
