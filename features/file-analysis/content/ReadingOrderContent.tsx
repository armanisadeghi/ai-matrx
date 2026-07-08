/**
 * ReadingOrderContent — on-demand reading-order viewer (W4 remainder / D32).
 *
 * Runs `/utilities/pdf/extract-reading-order` (streaming — one
 * `pdf_reading_order_page` per page, terminal `pdf_reading_order_complete`)
 * against the file's cld source and renders the multi-column-aware linear
 * block list per page. Each block carries its column index and text; page
 * headers jump the studio canvas to that page.
 *
 * Unlike the other content tabs this is not pre-computed by the analysis
 * pipeline, so it runs on demand and keeps the result in component state
 * (re-running is cheap and the payload is layout, not user data).
 */

"use client";

import { useCallback, useRef, useState } from "react";
import { BookOpenText, Columns3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  drainPdfStream,
  PdfStreamProgress,
} from "@/features/pdf/api/streamDrain";
import { buildPdfSourceFromFileId } from "@/features/pdf/utils/source";
import { ENDPOINTS } from "@/lib/api/endpoints";
import type {
  PdfReadingOrderCompleteData,
  PdfReadingOrderPageData,
} from "@/types/python-generated/stream-events";

interface Props {
  fileId: string;
  onJumpToPage?: (pageNumber: number) => void;
}

export function ReadingOrderContent({ fileId, onJumpToPage }: Props) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [report, setReport] = useState<PdfReadingOrderCompleteData | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setProgress(null);
    try {
      const result = await drainPdfStream<PdfReadingOrderCompleteData>(
        ENDPOINTS.pdf.extractReadingOrder,
        { ...buildPdfSourceFromFileId(fileId) },
        "pdf_reading_order_complete",
        {
          signal: controller.signal,
          onProgress: (d) => {
            if (d.type === "pdf_reading_order_page") {
              const p = d as PdfReadingOrderPageData;
              setProgress(
                `Page ${p.page_number}/${p.total_pages} — ${p.column_count} column${p.column_count === 1 ? "" : "s"}, ${p.block_count} block${p.block_count === 1 ? "" : "s"}`,
              );
            }
          },
        },
      );
      setReport(result);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [fileId]);

  if (!report) {
    return (
      <div className="flex flex-col items-center gap-3 rounded border border-dashed border-border bg-card/40 px-4 py-8 text-center">
        <BookOpenText className="h-5 w-5 text-muted-foreground/70" />
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          Extract the multi-column-aware reading order — the linear block
          sequence a person (or an LLM) should read the document in, per page.
        </p>
        <Button
          size="sm"
          className="h-7 gap-1.5 text-[11px]"
          disabled={running}
          onClick={() => void run()}
        >
          {running ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <BookOpenText className="h-3 w-3" />
          )}
          {running ? "Extracting…" : "Extract reading order"}
        </Button>
        {running && progress ? <PdfStreamProgress text={progress} /> : null}
        {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      </div>
    );
  }

  const pages = report.pages ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">
          {report.page_count} page{report.page_count === 1 ? "" : "s"} ·{" "}
          {pages.reduce((n, p) => n + (p.blocks_in_order?.length ?? 0), 0)}{" "}
          blocks in reading order
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-6 gap-1 px-2 text-[10px]"
          disabled={running}
          onClick={() => void run()}
        >
          {running ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : (
            <BookOpenText className="h-2.5 w-2.5" />
          )}
          Re-run
        </Button>
      </div>

      {pages.map((page) => (
        <section
          key={page.page_number}
          className="rounded-md border border-border bg-card"
        >
          <button
            type="button"
            onClick={() => onJumpToPage?.(page.page_number)}
            className="flex w-full items-center gap-2 border-b border-border px-2.5 py-1.5 text-left transition-colors hover:bg-accent/40"
            title={`Jump to page ${page.page_number}`}
          >
            <span className="text-[11px] font-semibold tabular-nums">
              Page {page.page_number}
            </span>
            <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
              <Columns3 className="h-3 w-3" />
              {page.column_count} column{page.column_count === 1 ? "" : "s"}
            </span>
          </button>
          <ol className="divide-y divide-border/60">
            {(page.blocks_in_order ?? []).map((block, i) => (
              <li
                key={i}
                className="flex gap-2 px-2.5 py-1.5 text-[11px] leading-snug"
              >
                <span className="w-6 shrink-0 text-right font-mono text-[10px] text-muted-foreground/70 tabular-nums">
                  {i + 1}
                </span>
                <span
                  className={cn(
                    "shrink-0 self-start rounded bg-primary/10 px-1 py-px font-mono text-[9px] text-primary",
                  )}
                  title={`Column ${block.column_index + 1} · bbox (${Math.round(block.x0)}, ${Math.round(block.y0)}) → (${Math.round(block.x1)}, ${Math.round(block.y1)})`}
                >
                  c{block.column_index + 1}
                </span>
                <span className="min-w-0 whitespace-pre-wrap break-words text-foreground/85">
                  {block.text || (
                    <span className="italic text-muted-foreground">
                      (empty block)
                    </span>
                  )}
                </span>
              </li>
            ))}
            {(page.blocks_in_order ?? []).length === 0 ? (
              <li className="px-2.5 py-1.5 text-[11px] italic text-muted-foreground">
                No text blocks on this page.
              </li>
            ) : null}
          </ol>
        </section>
      ))}
    </div>
  );
}
