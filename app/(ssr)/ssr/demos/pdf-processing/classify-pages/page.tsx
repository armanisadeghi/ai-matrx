"use client";

import { useState } from "react";
import { PdfDemoShell } from "@/features/pdf-demo/components/PdfDemoShell";
import {
  EMPTY_PDF_SOURCE,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import { usePdfDemoApi } from "@/features/pdf-demo/hooks/usePdfDemoApi";
import type { LayoutClassificationReport } from "@/features/pdf-extractor/types";

export default function ClassifyPagesDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LayoutClassificationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const json = await api.postJson<LayoutClassificationReport>(
        "classifyPages",
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
      title="Classify pages"
      endpoint="POST /utilities/pdf/classify-pages"
      description="Assign a page class (cover / TOC / body / exhibit / signature / billing / appendix / …) to every page with confidence + matched indicators."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      jsonResult={result}
      error={error}
    />
  );
}
