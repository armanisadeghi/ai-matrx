"use client";

import { useState } from "react";
import { PdfDemoShell } from "@/features/pdf-demo/components/PdfDemoShell";
import {
  EMPTY_PDF_SOURCE,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import { drainPdfStream, PdfStreamProgress } from "@/features/pdf/api/streamDrain";
import type { LayoutClassificationReport } from "@/features/pdf-extractor/types";
import type { PdfPageClassifiedData } from "@/types/python-generated/stream-events";

export default function ClassifyPagesDemo() {
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<LayoutClassificationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      const report = await drainPdfStream<LayoutClassificationReport>(
        "/utilities/pdf/classify-pages",
        { ...source.payload },
        "pdf_classify_complete",
        {
          onProgress: (d) => {
            if (d.type === "pdf_page_classified") {
              const p = d as PdfPageClassifiedData;
              setProgress(
                `Page ${p.page_number}/${p.total_pages} — ${p.page_class} (${Math.round(p.confidence * 100)}%)`,
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
      title="Classify pages"
      endpoint="POST /utilities/pdf/classify-pages"
      description="Assign a page class (cover / TOC / body / exhibit / signature / billing / appendix / …) to every page with confidence + matched indicators. Streams one event per page."
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
