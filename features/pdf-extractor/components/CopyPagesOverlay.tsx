"use client";

/**
 * CopyPagesOverlay — shared "copy page range to clipboard" panel.
 *
 * Two modes:
 *  - Single block  : leave "Pages per chunk" blank → copies everything as
 *                    one structured text block.
 *  - Batch chunks  : set pages per chunk + optional overlap → splits the
 *                    selected pages into exact page chunks for text copying
 *                    or one-click PDF ZIP download.
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

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
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
import { usePdfClient } from "@/features/pdf/api/client";
import { useDownloadBlob } from "@/features/pdf/hooks/useDownloadBlob";
import { buildPdfSource } from "@/features/pdf/utils/source";
import {
  chunkPdfPageNumbers,
  MAX_PDF_CHUNKS_PER_BATCH,
} from "@/features/pdf/utils/page-chunks";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_PAGES_PER_SECTION = "10";

function formatFullPageRange(maxPage: number): string {
  return maxPage <= 1 ? "1" : `1-${maxPage}`;
}

function getFlatPages(doc: PdfDocument, source: "raw" | "clean"): string[] {
  const flat = (source === "clean" ? doc.cleanContent : doc.content) ?? "";
  return flat.split("\f");
}

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

function downloadFilename(docName: string): string {
  const base = docName.replace(/\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "-");
  return `${base || "pdf"}-page-chunks.zip`;
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

function buildPageSections(
  pageRange: string,
  pagesPerSection: string,
  overlappingPages: string,
  maxPage: number,
  doc: PdfDocument,
  pageRows: PdfPageRow[],
  source: "raw" | "clean",
): { sections: PageSection[] } | { error: string } {
  const selectedPages = parsePageRange(pageRange, maxPage);
  if (selectedPages.length === 0) {
    return { error: "No valid pages in the given range." };
  }

  const chunkN = parseInt(pagesPerSection.trim(), 10);
  const chunkSize = isNaN(chunkN) || chunkN <= 0 ? 0 : chunkN;
  const overlapN = parseInt(overlappingPages.trim(), 10);
  const overlap = isNaN(overlapN) || overlapN <= 0 ? 0 : overlapN;
  if (chunkSize > 0 && overlap >= chunkSize) {
    return { error: "Overlap must be smaller than pages per chunk." };
  }
  const flatPages = getFlatPages(doc, source);
  const chunks = chunkPdfPageNumbers(selectedPages, chunkSize, overlap);
  if (chunks.length > MAX_PDF_CHUNKS_PER_BATCH) {
    return {
      error: `This creates ${chunks.length} chunks. Limit a batch to ${MAX_PDF_CHUNKS_PER_BATCH} chunks.`,
    };
  }

  const sections: PageSection[] = chunks.map((chunk, i) => {
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
      pageRows,
      flatPages,
      source,
      true,
    );
    return { label, pages: chunk, text, charCount: text.length };
  });

  return { sections };
}

const TABLE_COLS =
  "grid-cols-[3.5rem_minmax(5rem,max-content)_minmax(4.25rem,5rem)_minmax(3.75rem,4.5rem)_minmax(0,1fr)_minmax(3.25rem,auto)]";

function formatCopyButtonChars(charCount: number): string {
  if (charCount < 10_000) return charCount.toLocaleString();
  if (charCount < 1_000_000) {
    const compact = charCount / 1000;
    return compact >= 100
      ? `${Math.round(compact)}k`
      : `${compact.toFixed(1).replace(/\.0$/, "")}k`;
  }
  const compact = charCount / 1_000_000;
  return `${compact.toFixed(1).replace(/\.0$/, "")}M`;
}

function CopyCharButton({
  charCount,
  copied,
  onClick,
  title,
}: {
  charCount: number;
  copied: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "justify-self-end inline-flex items-center gap-1 min-w-[4rem] h-7 px-1.5 rounded border transition-colors",
        copied
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-border bg-background hover:bg-accent text-foreground",
      )}
    >
      {copied ? (
        <Check className="w-3 h-3 shrink-0" />
      ) : (
        <>
          <Copy className="w-3 h-3 shrink-0" />
          <span className="text-[9px] font-semibold tabular-nums leading-none">
            {formatCopyButtonChars(charCount)}
          </span>
        </>
      )}
    </button>
  );
}

function formatPageSpan(pageNums: number[]): string {
  if (pageNums.length === 0) return "—";
  if (pageNums.length === 1) return String(pageNums[0]);
  const first = pageNums[0];
  const last = pageNums[pageNums.length - 1];
  if (pageNums.length === last - first + 1) return `${first}–${last}`;
  return pageNums.join(", ");
}

function getCharCountTier(charCount: number): {
  accuracy: string;
  notes: string;
  className: string;
} {
  if (charCount < 20_000) {
    return {
      accuracy: "95–100%",
      notes: "Excellent",
      className: "text-blue-600 dark:text-blue-400",
    };
  }
  if (charCount < 50_000) {
    return {
      accuracy: "90–100%",
      notes: "Very good",
      className: "text-emerald-600 dark:text-emerald-400",
    };
  }
  if (charCount < 100_000) {
    return {
      accuracy: "70–90%",
      notes: "Slight losses",
      className: "text-yellow-600 dark:text-yellow-400",
    };
  }
  if (charCount < 400_000) {
    return {
      accuracy: "50–70%",
      notes: "Full coverage unlikely",
      className: "text-orange-600 dark:text-orange-400",
    };
  }
  if (charCount < 1_000_000) {
    return {
      accuracy: "30–50%",
      notes: "Point extraction only",
      className: "text-red-600 dark:text-red-400",
    };
  }
  if (charCount < 3_000_000) {
    return {
      accuracy: "15–30%",
      notes: "Significant degradation",
      className: "text-red-800 dark:text-red-500",
    };
  }
  return {
    accuracy: "<15%",
    notes: "Not recommended",
    className: "text-foreground",
  };
}

function buildCombinedSectionsText(
  sections: PageSection[],
  docId: string,
  docName: string,
  pageRows: PdfPageRow[],
  flatPages: string[],
  source: "raw" | "clean",
): string {
  if (sections.length === 0) return "";
  if (sections.length === 1) return sections[0].text;
  return (
    `File ID: ${docId}\nDocument: ${docName}\n` +
    sections
      .map(
        (s) =>
          `\n${"=".repeat(60)}\n${s.label}\n${"=".repeat(60)}\n` +
          s.pages
            .map((n) => {
              const text = getPageText(n, pageRows, flatPages, source);
              return `\n<page number="${n}">\n${text.trim()}\n</page>`;
            })
            .join("\n"),
      )
      .join("\n")
  );
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
  const [pagesPerSection, setPagesPerSection] = useState(
    DEFAULT_PAGES_PER_SECTION,
  );
  const [overlappingPages, setOverlappingPages] = useState("0");
  const [source, setSource] = useState<"raw" | "clean">("clean");
  const initializedForOpenRef = useRef<string | null>(null);
  const [sections, setSections] = useState<PageSection[]>([]);
  const [generated, setGenerated] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const pdfClient = usePdfClient();
  const downloadBlob = useDownloadBlob();

  // Flat-content fallback: split by form-feed (\f), the standard PDF page sep
  const flatPages = useMemo(
    () => getFlatPages(doc, source),
    [source, doc.cleanContent, doc.content],
  );

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

  const copyAllCharCount = useMemo(
    () =>
      buildCombinedSectionsText(
        sections,
        doc.id,
        doc.name,
        pages,
        flatPages,
        source,
      ).length,
    [sections, doc.id, doc.name, pages, flatPages, source],
  );

  const allPageSpan = useMemo(() => {
    const pageNums = [
      ...new Set(sections.flatMap((section) => section.pages)),
    ].sort((a, b) => a - b);
    return formatPageSpan(pageNums);
  }, [sections]);

  const copyAllTier = getCharCountTier(copyAllCharCount);

  // ── Generate / Copy ───────────────────────────────────────────────────────

  const regenerateSections = useCallback(
    (nextSource?: "raw" | "clean") => {
      const activeSource = nextSource ?? source;
      if (nextSource) setSource(nextSource);

      setErrorMsg(null);
      const result = buildPageSections(
        pageRange,
        pagesPerSection,
        overlappingPages,
        maxPage,
        doc,
        pages,
        activeSource,
      );
      if ("error" in result) {
        setErrorMsg(result.error);
        setSections([]);
        setGenerated(false);
        return;
      }

      setSections(result.sections);
      setGenerated(true);
      setExpandedIdx(null);
      setCopiedIdx(null);
      setCopiedAll(false);
    },
    [source, pageRange, pagesPerSection, overlappingPages, maxPage, doc, pages],
  );

  const handleGenerate = regenerateSections;

  useEffect(() => {
    if (!open) {
      initializedForOpenRef.current = null;
      return;
    }
    if (pagesLoading || initializedForOpenRef.current === doc.id) return;

    initializedForOpenRef.current = doc.id;
    const defaultSource: "raw" | "clean" = hasClean ? "clean" : "raw";
    const defaultRange = formatFullPageRange(maxPage);

    setSource(defaultSource);
    setPageRange(defaultRange);
    setPagesPerSection(DEFAULT_PAGES_PER_SECTION);
    setOverlappingPages("0");
    setErrorMsg(null);
    setExpandedIdx(null);
    setCopiedIdx(null);
    setCopiedAll(false);

    const result = buildPageSections(
      defaultRange,
      DEFAULT_PAGES_PER_SECTION,
      "0",
      maxPage,
      doc,
      pages,
      defaultSource,
    );
    if ("error" in result) {
      setErrorMsg(result.error);
      setSections([]);
      setGenerated(false);
      return;
    }

    setSections(result.sections);
    setGenerated(true);
  }, [open, pagesLoading, doc, pages, maxPage, hasClean]);

  const handleDownloadPdfChunks = useCallback(async () => {
    if (sections.length === 0) return;
    const sourceWire = buildPdfSource(doc);
    if (!sourceWire) {
      setErrorMsg("The source PDF is unavailable, so its pages cannot be exported.");
      return;
    }
    setDownloadingPdf(true);
    setErrorMsg(null);
    try {
      const result = await pdfClient.postPdfBlob("split", {
        ...sourceWire,
        parts: sections.map((section, index) => ({
          pages: section.pages,
          filename: `${downloadFilename(doc.name).replace(/\.zip$/i, "")}-${String(index + 1).padStart(3, "0")}-pages-${formatPageSpan(section.pages)}.pdf`,
        })),
      });
      downloadBlob({
        blob: result.blob,
        filename: downloadFilename(doc.name),
      });
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? `Could not create PDF chunks: ${error.message}`
          : "Could not create PDF chunks.",
      );
    } finally {
      setDownloadingPdf(false);
    }
  }, [sections, doc, pdfClient, downloadBlob]);

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
    const combined = buildCombinedSectionsText(
      sections,
      doc.id,
      doc.name,
      pages,
      flatPages,
      source,
    );
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
        setPagesPerSection(DEFAULT_PAGES_PER_SECTION);
        setOverlappingPages("0");
        setSource("clean");
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
            Copy Pages from {doc.name}
          </DialogTitle>
        </DialogHeader>

        {/* ── Config area ─────────────────────────────────────────────── */}
        <div className="shrink-0 px-5 py-3 space-y-3 border-b border-border">
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
                    if (source !== "raw") regenerateSections("raw");
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
                    if (source !== "clean") regenerateSections("clean");
                  }}
                  disabled={!hasClean}
                  title={hasClean ? "Cleaned text" : "Run cleanup first"}
                  className={cn(
                    "px-2.5 py-1.5 text-[11px] font-medium rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                    source === "clean"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-accent",
                  )}
                >
                  Clean
                </button>
              </div>
            </div>

            {/* Page range */}
            <div className="flex-1">
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">
                Page range
              </label>
              <Input
                value={pageRange}
                onChange={(e) => {
                  setPageRange(e.target.value);
                  setGenerated(false);
                  setErrorMsg(null);
                }}
                placeholder={`1-${maxPage}`}
                className="h-8 text-xs font-mono"
              />
            </div>

            {/* Pages per chunk */}
            <div className="w-28 shrink-0">
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">
                Pages / chunk
              </label>
              <Input
                value={pagesPerSection}
                onChange={(e) => {
                  setPagesPerSection(e.target.value);
                  setGenerated(false);
                }}
                placeholder="10"
                className="h-8 text-xs font-mono"
                type="number"
                min="1"
              />
            </div>

            {/* Overlap */}
            <div className="w-20 shrink-0">
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">
                Overlap
              </label>
              <Input
                value={overlappingPages}
                onChange={(e) => {
                  setOverlappingPages(e.target.value);
                  setGenerated(false);
                  setErrorMsg(null);
                }}
                placeholder="0"
                className="h-8 text-xs font-mono"
                type="number"
                min="0"
                max={Math.max(0, chunkSize - 1)}
                disabled={!isBatchMode}
              />
            </div>

            {/* Action button */}
            <Button
              size="sm"
              className="h-8 shrink-0 text-xs"
              onClick={() => handleGenerate()}
              disabled={pagesLoading}
            >
              {isBatchMode ? "Generate Chunks" : "Generate"}
            </Button>
          </div>

          {errorMsg && (
            <p className="text-[10px] text-destructive">{errorMsg}</p>
          )}
        </div>

        {/* ── Sections list ───────────────────────────────────────────────── */}
        {generated && sections.length > 0 && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-5 py-2">
                <div
                  className={cn(
                    "grid items-center gap-x-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-2",
                    TABLE_COLS,
                  )}
                >
                  <span>Sections</span>
                  <span>Pages</span>
                  <span className="text-right tabular-nums">Characters</span>
                  <span className="text-right tabular-nums">Accuracy</span>
                  <span>Expected Quality</span>
                  <span className="sr-only">Copy</span>
                </div>

                <div
                  className={cn(
                    "grid items-center gap-x-3 py-2 border-b border-border bg-muted/20",
                    TABLE_COLS,
                  )}
                >
                  <span className="text-xs font-medium">All</span>
                  <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                    {allPageSpan}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums text-right",
                      copyAllTier.className,
                    )}
                  >
                    {copyAllCharCount.toLocaleString()}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-medium tabular-nums text-right",
                      copyAllTier.className,
                    )}
                  >
                    {copyAllTier.accuracy}
                  </span>
                  <span
                    className={cn(
                      "text-xs leading-snug",
                      copyAllTier.notes
                        ? copyAllTier.className
                        : "text-muted-foreground",
                    )}
                  >
                    {copyAllTier.notes || "—"}
                  </span>
                  <CopyCharButton
                    charCount={copyAllCharCount}
                    copied={copiedAll}
                    onClick={handleCopyAll}
                    title="Copy all sections"
                  />
                </div>

                <div className="flex justify-end py-2 border-b border-border">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-[11px]"
                    onClick={() => void handleDownloadPdfChunks()}
                    disabled={downloadingPdf}
                  >
                    {downloadingPdf ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3" />
                    )}
                    Download {sections.length} PDF chunk{sections.length === 1 ? "" : "s"}
                  </Button>
                </div>

                {sections.map((sec, idx) => {
                  const isExpanded = expandedIdx === idx;
                  const isCopied = copiedIdx === idx;
                  const tier = getCharCountTier(sec.charCount);
                  return (
                    <div
                      key={idx}
                      className="border-b border-border last:border-b-0"
                    >
                      <div
                        className={cn(
                          "grid items-center gap-x-3 py-2 hover:bg-muted/30 transition-colors",
                          TABLE_COLS,
                        )}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedIdx(isExpanded ? null : idx)
                          }
                          className="flex items-center gap-0.5 min-w-0 w-full text-left"
                        >
                          <span className="text-xs font-medium truncate flex-1 min-w-0">
                            {sections.length === 1
                              ? "Single"
                              : `Sec ${idx + 1}`}
                          </span>
                          {isExpanded ? (
                            <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                          )}
                        </button>
                        <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                          {formatPageSpan(sec.pages)}
                        </span>
                        <span
                          className={cn(
                            "text-sm font-semibold tabular-nums text-right",
                            tier.className,
                          )}
                        >
                          {sec.charCount.toLocaleString()}
                        </span>
                        <span
                          className={cn(
                            "text-xs font-medium tabular-nums text-right",
                            tier.className,
                          )}
                        >
                          {tier.accuracy}
                        </span>
                        <span
                          className={cn(
                            "text-xs leading-snug",
                            tier.notes
                              ? tier.className
                              : "text-muted-foreground",
                          )}
                        >
                          {tier.notes || "—"}
                        </span>
                        <CopyCharButton
                          charCount={sec.charCount}
                          copied={isCopied}
                          onClick={() => void handleCopySection(idx)}
                          title={`Copy section ${idx + 1}`}
                        />
                      </div>

                      {isExpanded && (
                        <div className="pb-3">
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
          </div>
        )}

        {/* Empty state when not yet generated */}
        {!generated && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8 text-center">
            {pagesLoading ? (
              <>
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                <p className="text-xs text-muted-foreground">Loading pages…</p>
              </>
            ) : (
              <>
                <ClipboardList className="w-8 h-8 text-muted-foreground/20" />
                <p className="text-xs text-muted-foreground">
                  Adjust options above, then click{" "}
                  <span className="font-medium">Generate</span>.
                </p>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
