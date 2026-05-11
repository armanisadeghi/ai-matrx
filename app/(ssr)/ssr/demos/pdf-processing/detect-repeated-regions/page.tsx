"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, PdfDemoShell } from "@/features/pdf-demo/components/PdfDemoShell";
import {
  EMPTY_PDF_SOURCE,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import { usePdfDemoApi } from "@/features/pdf-demo/hooks/usePdfDemoApi";
import type { RepeatedRegionsReport } from "@/features/pdf-extractor/types";

export default function DetectRepeatedRegionsDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [minPagesRatio, setMinPagesRatio] = useState(0.3333);
  const [minConfidence, setMinConfidence] = useState(0.5);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RepeatedRegionsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const json = await api.postJson<RepeatedRegionsReport>(
        "detectRepeatedRegions",
        {
          ...source.payload,
          min_pages_ratio: minPagesRatio,
          min_confidence: minConfidence,
        },
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
      title="Detect repeated regions"
      endpoint="POST /utilities/pdf/detect-repeated-regions"
      description="Find headers / footers / watermarks / recurring side notes across pages. Returns deterministic region IDs you can persist or hand to /redact-repeated-regions."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      jsonResult={result}
      error={error}
    >
      <FieldGroup>
        <Field label="Min pages ratio" hint="0.0–1.0 — fraction of pages a region must span">
          <Input
            type="number"
            step={0.05}
            min={0}
            max={1}
            value={minPagesRatio}
            onChange={(e) => setMinPagesRatio(Number(e.target.value) || 0.3333)}
          />
        </Field>
        <Field label="Min confidence" hint="0.0–1.0 — drop weaker candidates">
          <Input
            type="number"
            step={0.05}
            min={0}
            max={1}
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value) || 0.5)}
          />
        </Field>
      </FieldGroup>
    </PdfDemoShell>
  );
}
