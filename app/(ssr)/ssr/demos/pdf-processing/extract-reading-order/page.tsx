"use client";

import { useState } from "react";
import { PdfDemoShell } from "@/features/pdf-demo/components/PdfDemoShell";
import {
  EMPTY_PDF_SOURCE,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import { usePdfDemoApi } from "@/features/pdf-demo/hooks/usePdfDemoApi";
import type { ReadingOrderReport } from "@/features/pdf-extractor/types";

export default function ExtractReadingOrderDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ReadingOrderReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const json = await api.postJson<ReadingOrderReport>(
        "extractReadingOrder",
        { ...source.payload },
      );
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <PdfDemoShell
      title="Extract reading order"
      endpoint="POST /utilities/pdf/extract-reading-order"
      description="Multi-column-aware linear block list per page. Each block carries column_index, bbox, and text."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      jsonResult={result}
      error={error}
    />
  );
}
