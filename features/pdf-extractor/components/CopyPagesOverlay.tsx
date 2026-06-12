"use client";

/**
 * CopyPagesOverlay — shared "copy page range to clipboard" panel.
 *
 * Two modes:
 *  - Single block  : leave "Pages per section" blank → copies everything as
 *                    one structured text block.
 *  - Batch sections: fill in a chunk size → splits the selected pages into
 *                    N sections, shows a list so you can copy each one
 *                    individually or grab them all at once.
 *
 * Each copied block has this shape:
 *
 *   File ID: <id>
 *   Document: <name>
 *
 *   <page number="1">
 *   raw or cleaned page text
 *   </page>
 *
 *   <page number="2">
 *   ...
 *   </page>
 *
 * "Copy All" joins every section with a section header separator.
 *
 * Data sourcing:
 *   - Primary  : `pages` prop — per-page rows from `processed_document_pages`.
 *   - Fallback  : splits the flat `content` / `cleanContent` string by \f
 *                 (standard PDF form-feed page separator) for legacy docs
 *                 that predate per-page persistence.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PdfDocument } from "../hooks/usePdfExtractor";
import type { PdfPageRow } from "../hooks/useProcessedDocumentPages";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse "1-5,7,10-12" into a sorted, deduped array of 1-based page numbers
 * clamped to [1, maxPage]. Blank → all pages 1…maxPage.
 */
export function parsePageRange(input: string, maxPage: number): number[] {
  if (!input.trim()) return Array.from({ length: maxPage }, (_, i) => i + 1);
  const pages: number[] = [];
  for (const part of input.split(",")) {
    const trimmed = part.trim();
    if (trimmed.includes("-")) {
      const [rawStart, rawEnd] = trimmed.split("-");
      const start = parseInt(rawStart.trim(), 10);
      const end = parseInt(rawEnd.trim(), 10);
      if (!isNaN(start) && !isNaN(end)) {
        for (let p = Math.max(1, start); p <= Math.min(end, maxPage); p++) {
          pages.push(p);
        }
      }
    } else {
      const n = parseInt(trimmed, 10);
      if (!isNaN(n) && n >= 1 && n <= maxPage) pages.push(n);
    }
  }
  return [...new Set(pages)].sort((a, b) => a - b);
}

/**
 * Chunk an array into sub-arrays of `size`. If size <= 0 the whole array is
 * returned as a single chunk.
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get the text for a single page, with per-page DB rows as the primary
 * source and \f-split flat content as the fallback.
 */
function getPageText(
  pageNum: number,
  pageRows: PdfPageRow[],
  flatPages: string[],
  source: "raw" | "clean",
): string {
  const row = pageRows.find((r) => r.pageNumber === pageNum);
  if (row) {
    return source === "clean" ? row.cleanedText || row.rawText : row.rawText;
  }
  return (flatPages[pageNum - 1] ?? "").trim();
}

/**
 * Build the structured clipboard text for a list of page numbers.
 */
function buildSectionText(
  docId: string,
  docName: string,
  pageNums: number[],
  pageRows: PdfPageRow[],
  flatPages: string[],
  source: "raw" | "clean",
  includeHeader: boolean,
): string {
  const header = includeHeader
    ? `File ID: ${docId}\nDocument: ${docName}\n`
    : "";
  const blocks = pageNums.map((n) => {
    const text = getPageText(n, pageRows, flatPages, source);
    return `\n<page number="${n}">\n${text.trim()}\n</page>`;
  });
  return header + blocks.join("\n");
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageSection {
  label: string;
  pages: number[];
  text: string;
  charCount: number;
}

export interface CopyPagesOverlayProps {
  open: boolean;
  onClose: () => void;
  doc: PdfDocument;
  /** Per-page DB rows — pass [] while loading. */
  pages: PdfPageRow[];
  pagesLoading?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CopyPagesOverlay({
  open,
  onClose,
  doc,
  pages,
  pagesLoading = false,
}: CopyPagesOverlayProps) {
  const [pageRange, setPageRange] = useState("");
  const [pagesPerSection, setPagesPerSection] = useState("");
  const [source, setSource] = useState<"raw" | "clean">("raw");
  const [sections, setSections] = useState<PageSection[]>([]);
  const [generated, setGenerated] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Flat-content fallback: split by form-feed (\f), the standard PDF page sep
  const flatPages = useMemo(() => {
    const flat = (source === "clean" ? doc.cleanContent : doc.content) ?? "";
    return flat.split("\f");
  }, [source, doc.cleanContent, doc.content]);

  const maxPage = useMemo(() => {
    if (pages.length > 0) return pages[pages.length - 1].pageNumber;
    if (doc.totalPages) return doc.totalPages;
    return Math.max(1, flatPages.length);
  }, [pages, doc.totalPages, flatPages]);

  const hasClean =
    !!doc.cleanContent || pages.some((p) => p.cleanedText?.trim());

  const chunkSize = useMemo(() => {
    const n = parseInt(pagesPerSection.trim(), 10);
    return isNaN(n) || n <= 0 ? 0 : n;
  }, [pagesPerSection]);

  const isBatchMode = chunkSize > 0;

  // ── Generate / Copy ───────────────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    setErrorMsg(null);
    const selectedPages = parsePageRange(pageRange, maxPage);
    if (selectedPages.length === 0) {
      setErrorMsg("No valid pages in the given range.");
      return;
    }

    const chunks = chunkArray(selectedPages, chunkSize);
    const built: PageSection[] = chunks.map((chunk, i) => {
      const first = chunk[0];
      const last = chunk[chunk.length - 1];
      const label =
        chunks.length === 1
          ? chunk.length === 1
            ? `Page ${first}`
            : `Pages ${first}–${last}`
          : `Section ${i + 1} · pages ${first}–${last}`;
      const text = buildSectionText(
        doc.id,
        doc.name,
        chunk,
        pages,
        flatPages,
        source,
        true,
      );
      return { label, pages: chunk, text, charCount: text.length };
    });

    setSections(built);
    setGenerated(true);
    setExpandedIdx(null);
    setCopiedIdx(null);
    setCopiedAll(false);
  }, [pageRange, maxPage, chunkSize, doc, pages, flatPages, source]);

  const handleCopySection = useCallback(
    async (idx: number) => {
      try {
        await navigator.clipboard.writeText(sections[idx].text);
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 1800);
      } catch {
        setErrorMsg("Could not write to clipboard.");
      }
    },
    [sections],
  );

  const handleCopyAll = useCallback(async () => {
    if (sections.length === 0) return;
    const combined =
      sections.length === 1
        ? sections[0].text
        : `File ID: ${doc.id}\nDocument: ${doc.name}\n` +
          sections
            .map(
              (s) =>
                `\n${"=".repeat(60)}\n${s.label}\n${"=".repeat(60)}\n` +
                s.pages
                  .map((n) => {
                    const text = getPageText(n, pages, flatPages, source);
                    return `\n<page number="${n}">\n${text.trim()}\n</page>`;
                  })
                  .join("\n"),
            )
            .join("\n");
    try {
      await navigator.clipboard.writeText(combined);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    } catch {
      setErrorMsg("Could not write to clipboard.");
    }
  }, [sections, doc.id, doc.name, pages, flatPages, source]);

  // ── Reset on close ────────────────────────────────────────────────────────

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setPageRange("");
        setPagesPerSection("");
        setSections([]);
        setGenerated(false);
        setExpandedIdx(null);
        setCopiedIdx(null);
        setCopiedAll(false);
        setErrorMsg(null);
        onClose();
      }
    },
    [onClose],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ClipboardList className="w-4 h-4 text-primary" />
            Copy Pages to Clipboard
          </DialogTitle>
        </DialogHeader>

        {/* ── Config area ─────────────────────────────────────────────── */}
        <div className="shrink-0 px-5 py-3 space-y-3 border-b border-border">
          {/* Doc info */}
          <div className="px-2.5 py-2 bg-muted/40 border border-border rounded-md grid grid-cols-2 gap-x-4 gap-y-0.5">
            <p className="text-[10px] text-muted-foreground font-mono truncate col-span-2">
              <span className="text-muted-foreground/60">ID: </span>
              {doc.id}
            </p>
            <p className="text-[10px] text-foreground/80 truncate">
              <span className="text-muted-foreground/60">Doc: </span>
              {doc.name}
            </p>
            <p className="text-[10px] text-muted-foreground/60 text-right">
              {pagesLoading ? (
                <span className="flex items-center justify-end gap-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  loading…
                </span>
              ) : pages.length > 0 ? (
                `${maxPage} pages`
              ) : doc.totalPages ? (
                `${doc.totalPages} pages (legacy)`
              ) : (
                "page count unknown"
              )}
            </p>
          </div>

          {/* Source + range + chunk size — three controls in one row */}
          <div className="flex items-end gap-2">
            {/* Source toggle */}
            <div className="shrink-0">
              <p className="text-[10px] font-medium text-muted-foreground mb-1">
                Source
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSource("raw");
                    setGenerated(false);
                  }}
                  className={cn(
                    "px-2.5 py-1.5 text-[11px] font-medium rounded border transition-colors",
                    source === "raw"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-accent",
                  )}
                >
                  Raw
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSource("clean");
                    setGenerated(false);
                  }}
                  disabled={!hasClean}
                  title={hasClean ? "AI Cleaned" : "Run AI Cleanup first"}
                  className={cn(
                    "px-2.5 py-1.5 text-[11px] font-medium rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                    source === "clean"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-accent",
                  )}
                >
                  AI Clean
                </button>
              </div>
            </div>

            {/* Page range */}
            <div className="flex-1">
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">
                Page range
                <span className="ml-1 font-normal opacity-60">
                  (blank = all)
                </span>
              </label>
              <Input
                value={pageRange}
                onChange={(e) => {
                  setPageRange(e.target.value);
                  setGenerated(false);
                  setErrorMsg(null);
                }}
                placeholder={`1–${maxPage}`}
                className="h-8 text-xs font-mono"
              />
            </div>

            {/* Pages per section */}
            <div className="w-36 shrink-0">
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">
                Pages / section
                <span className="ml-1 font-normal opacity-60">(blank = 1)</span>
              </label>
              <Input
                value={pagesPerSection}
                onChange={(e) => {
                  setPagesPerSection(e.target.value);
                  setGenerated(false);
                }}
                placeholder="e.g. 5"
                className="h-8 text-xs font-mono"
                type="number"
                min="1"
              />
            </div>

            {/* Action button */}
            <Button
              size="sm"
              className="h-8 shrink-0 text-xs"
              onClick={handleGenerate}
              disabled={pagesLoading}
            >
              {isBatchMode ? "Generate Sections" : "Generate"}
            </Button>
          </div>

          {errorMsg && (
            <p className="text-[10px] text-destructive">{errorMsg}</p>
          )}
        </div>

        {/* ── Sections list ───────────────────────────────────────────────── */}
        {generated && sections.length > 0 && (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* List header */}
            <div className="shrink-0 flex items-center justify-between px-5 py-2 border-b border-border bg-muted/20">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {sections.length} section{sections.length !== 1 ? "s" : ""} ·{" "}
                {sections.reduce((a, s) => a + s.pages.length, 0)} pages
              </span>
              <button
                type="button"
                onClick={handleCopyAll}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded border transition-colors",
                  copiedAll
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-border bg-background hover:bg-accent text-foreground",
                )}
              >
                {copiedAll ? (
                  <>
                    <Check className="w-3 h-3" />
                    Copied All!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy All Sections
                  </>
                )}
              </button>
            </div>

            {/* Scrollable section rows */}
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border">
              {sections.map((sec, idx) => {
                const isExpanded = expandedIdx === idx;
                const isCopied = copiedIdx === idx;
                return (
                  <div key={idx} className="group">
                    {/* Row header */}
                    <div className="flex items-center gap-2 px-5 py-2.5 hover:bg-muted/30 transition-colors">
                      <button
                        type="button"
                        onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                        className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        )}
                        <FileText className="w-3 h-3 text-primary/60 shrink-0" />
                        <span className="text-[11px] font-medium truncate">
                          {sec.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 shrink-0 ml-1">
                          {sec.charCount.toLocaleString()} chars
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleCopySection(idx)}
                        className={cn(
                          "shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border transition-colors",
                          isCopied
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "border-border bg-background hover:bg-accent text-foreground opacity-0 group-hover:opacity-100",
                        )}
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-2.5 h-2.5" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-2.5 h-2.5" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>

                    {/* Expanded content preview */}
                    {isExpanded && (
                      <div className="px-5 pb-3">
                        <pre className="text-[10px] font-mono text-foreground/70 whitespace-pre-wrap leading-relaxed bg-muted/30 border border-border rounded-md p-2.5 max-h-48 overflow-y-auto scrollbar-thin">
                          {sec.text}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state when not yet generated */}
        {!generated && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8 text-center">
            <ClipboardList className="w-8 h-8 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">
              Configure options above, then click{" "}
              <span className="font-medium">Generate</span> to build your
              sections.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
