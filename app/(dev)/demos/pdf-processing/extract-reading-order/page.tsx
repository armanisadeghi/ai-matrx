"use client";

import { useState } from "react";
import { PdfDemoShell } from "@/features/pdf-demo/components/PdfDemoShell";
import {
  EMPTY_PDF_SOURCE,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import { drainPdfStream, PdfStreamProgress } from "@/features/pdf/api/streamDrain";
import type { ReadingOrderReport } from "@/features/pdf-extractor/types";
import type { PdfReadingOrderPageData } from "@/types/python-generated/stream-events";

export default function ExtractReadingOrderDemo() {
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<ReadingOrderReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      const report = await drainPdfStream<ReadingOrderReport>(
        "/utilities/pdf/extract-reading-order",
        { ...source.payload },
        "pdf_reading_order_complete",
        {
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
      setResult(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  return (
    <PdfDemoShell
      title="Extract reading order"
      endpoint="POST /utilities/pdf/extract-reading-order"
      description="Multi-column-aware linear block list per page. Each block carries column_index, bbox, and text. Streams one event per page."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      jsonResult={result}
      error={error}
      extra={progress ? <PdfStreamProgress text={progress} /> : null}
    />
  );
}
