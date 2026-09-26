/**
 * Page-by-page text reader. The big one. Renders the actual extracted text
 * from every page with page navigation, OCR badges, and a "copy page" action.
 *
 * Layout: top bar with page selector + total chars + source badges, scrollable
 * text body preserving the original line breaks. NOT virtualized for now —
 * even at 400 pages each page is just a string render, fast enough.
 */

"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FileAnalysisResultRow } from "@/features/file-analysis/api/file-analysis";
import {
  asObject,
  findResult,
  type TextExtractionPagePayload,
  type TextExtractionPayload,
} from "./utils";

interface Props {
  results: FileAnalysisResultRow[];
  onJumpToPage?: (pageNumber: number) => void;
  initialPage?: number;
}

export function TextContent({ results, onJumpToPage, initialPage = 1 }: Props) {
  const nativeResult = findResult(results, "text_extraction_native");
  const ocrResult = findResult(results, "text_extraction_ocr");

  const merged = useMemo(() => {
    const byPage = new Map<number, TextExtractionPagePayload>();
    const nativePayload = asObject<TextExtractionPayload>(nativeResult?.payload);
    if (nativePayload) {
      for (const p of nativePayload.pages ?? []) {
        byPage.set(p.page_number, { ...p });
      }
    }
    const ocrPayload = asObject<TextExtractionPayload>(ocrResult?.payload);
    if (ocrPayload) {
      for (const p of ocrPayload.pages ?? []) {
        const existing = byPage.get(p.page_number) ?? { page_number: p.page_number, chars: 0 };
        byPage.set(p.page_number, {
          ...existing,
          text_ocr: p.text_ocr ?? p.text,
          ocr_confidence: p.ocr_confidence,
          source:
            existing.text && (p.text_ocr ?? p.text)
              ? "mixed"
              : p.text_ocr ?? p.text
                ? "ocr"
                : existing.source,
        });
      }
    }
    return Array.from(byPage.values()).sort(
      (a, b) => a.page_number - b.page_number,
    );
  }, [nativeResult, ocrResult]);

  const [active, setActive] = useState<number>(
    Math.max(1, Math.min(initialPage, merged.length || 1)),
  );

  if (!merged.length) {
    return (
      <EmptyHint message="No extracted text yet. The text-extraction detector hasn't finished — give it a few seconds or click Refresh." />
    );
  }

  const ocrState = describeOcrState(ocrResult);
  const page = merged.find((p) => p.page_number === active) ?? merged[0];
  const pageOcrPending = ocrState.pendingPages.has(page.page_number);
  const display = page.text_ocr ?? page.text ?? "";
  const totalChars = merged.reduce(
    (acc, p) => acc + ((p.text_ocr ?? p.text ?? "").length),
    0,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/40 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={active <= 1}
            onClick={() => setActive((n) => Math.max(1, n - 1))}
            className="h-6 w-6 p-0"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <select
            value={active}
            onChange={(e) => setActive(Number.parseInt(e.target.value, 10))}
            className="h-7 rounded border border-border bg-background px-1.5 text-xs tabular-nums"
          >
            {merged.map((p) => (
              <option key={p.page_number} value={p.page_number}>
                Page {p.page_number}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            of {merged.length}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={active >= merged.length}
            onClick={() => setActive((n) => Math.min(merged.length, n + 1))}
            className="h-6 w-6 p-0"
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <SourceBadge source={page.source} confidence={page.ocr_confidence ?? null} />
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
          {display.length.toLocaleString()} chars · doc total{" "}
          {totalChars.toLocaleString()}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px]"
          onClick={() => void navigator.clipboard.writeText(display)}
        >
          <Copy className="h-3 w-3 mr-1" /> Copy page
        </Button>
        {onJumpToPage ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px]"
            onClick={() => onJumpToPage(active)}
          >
            <FileText className="h-3 w-3 mr-1" /> Open in viewer
          </Button>
        ) : null}
      </div>

      {ocrState.notice ? (
        <div
          role="status"
          className="flex items-start gap-1.5 border-b border-border bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-200"
        >
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          <span>{ocrState.notice}</span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-3 text-sm leading-relaxed">
        {pageOcrPending ? (
          <div className="mb-2 text-[11px] italic text-muted-foreground">
            Text recognition did not reach this page in the last run — showing the
            PDF&apos;s own text.
          </div>
        ) : null}
        {display ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-[1.6] text-foreground">
            {display}
          </pre>
        ) : (
          <div className="text-xs italic text-muted-foreground">
            {!ocrResult
              ? "No text on this page. It is likely image-only; text recognition has not run on it yet."
              : ocrResult.status === "failed" || pageOcrPending
                ? "No text on this page. It is likely image-only, and text recognition did not reach it."
                : "No text on this page. It is likely image-only, and text recognition found no words on it."}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceBadge({
  source,
  confidence,
}: {
  source: "native" | "ocr" | "mixed" | undefined;
  confidence: number | null;
}) {
  const label =
    source === "native"
      ? "Native"
      : source === "ocr"
        ? "OCR"
        : source === "mixed"
          ? "Native + OCR"
          : "Unknown";
  const tone =
    source === "ocr" || source === "mixed"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
        tone,
      )}
    >
      {label}
      {source === "ocr" || source === "mixed"
        ? confidence != null
          ? ` · ${Math.round(confidence * 100)}%`
          : ""
        : ""}
    </span>
  );
}

/**
 * What the OCR detector actually achieved, in words a person can act on. The
 * detector is time-bounded (matrx-files, 2026-09-26): on a large document it
 * stops starting pages at its budget and reports `complete: false` with the
 * pages it did not reach, and a run that still fails carries its error. The
 * Text tab used to show neither — a failed or partial OCR looked finished.
 */
function describeOcrState(ocrResult: FileAnalysisResultRow | undefined): {
  notice: string | null;
  pendingPages: Set<number>;
} {
  const pendingPages = new Set<number>();
  if (!ocrResult) return { notice: null, pendingPages };
  if (ocrResult.status === "failed") {
    const reason = ocrResult.error?.split("\n")[0]?.trim();
    return {
      notice: `Text recognition (OCR) did not finish${reason ? ` (${reason})` : ""}. The text shown is the PDF's own text layer; use Refresh to try again.`,
      pendingPages,
    };
  }
  const summary = asObject<Record<string, unknown>>(ocrResult.summary);
  const payload = asObject<{ pages_pending?: unknown }>(ocrResult.payload);
  if (Array.isArray(payload?.pages_pending)) {
    for (const p of payload.pages_pending) {
      if (typeof p === "number") pendingPages.add(p);
    }
  }
  if (summary?.complete === false) {
    const done = typeof summary.pages_ocred === "number" ? summary.pages_ocred : 0;
    const requested =
      typeof summary.pages_requested === "number" ? summary.pages_requested : done + pendingPages.size;
    const pending = requested - done;
    const why =
      summary.stopped_reason === "ocr_binary_missing"
        ? "the OCR engine is not available on the server"
        : "it reached its time limit for one run";
    return {
      notice: `Text recognition read ${done} of ${requested} pages that needed it — ${why}. The other ${pending} page${pending === 1 ? "" : "s"} show the PDF's own text.`,
      pendingPages,
    };
  }
  return { notice: null, pendingPages };
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}
