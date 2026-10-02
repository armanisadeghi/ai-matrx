"use client";

import { ClampedNumberInput } from "@/components/official/ClampedNumberInput";
import { useState } from "react";
import {
  Field,
  FieldGroup,
  PdfWorkbench,
} from "@/features/pdf-demo/components/PdfWorkbench";
import {
  EMPTY_PDF_SOURCE,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import { PdfJsonResult } from "@/features/pdf-demo/components/PdfJsonResult";
import { RegionOverlayPreview } from "@/features/pdf-demo/components/RegionOverlayPreview";
import { drainPdfStream, PdfStreamProgress } from "@/features/pdf/api/streamDrain";
import type { RepeatedRegionsReport } from "@/features/pdf-extractor/types";
import type { PdfRepeatedRegionsProgressData } from "@ai-matrx/agents/generated/stream-events";

export default function DetectRepeatedRegionsDemo() {
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [minPagesRatio, setMinPagesRatio] = useState(0.3333);
  const [minConfidence, setMinConfidence] = useState(0.5);
  const [renderDpi, setRenderDpi] = useState(120);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<RepeatedRegionsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      const report = await drainPdfStream<RepeatedRegionsReport>(
        "/utilities/pdf/detect-repeated-regions",
        {
          ...source.payload,
          min_pages_ratio: minPagesRatio,
          min_confidence: minConfidence,
        },
        "pdf_repeated_regions_complete",
        {
          onProgress: (d) => {
            if (d.type === "pdf_repeated_regions_progress") {
              const p = d as PdfRepeatedRegionsProgressData;
              setProgress(
                `Detecting — page ${p.page_number}/${p.total_pages}`,
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

  const controls = (
    <FieldGroup>
      <Field label="Min pages ratio" hint="0.0–1.0 — fraction of pages a region must span">
        <ClampedNumberInput value={minPagesRatio} min={0} max={1} decimal step={0.05} onChange={setMinPagesRatio} />
      </Field>
      <Field label="Min confidence" hint="0.0–1.0 — drop weaker candidates">
        <ClampedNumberInput value={minConfidence} min={0} max={1} decimal step={0.05} onChange={setMinConfidence} />
      </Field>
      <Field label="Overlay render DPI" hint="Quality of the page-thumbnails shown with region boxes overlaid">
        <ClampedNumberInput value={renderDpi} min={72} max={300} onChange={setRenderDpi} />
      </Field>
    </FieldGroup>
  );

  const regions = result?.regions ?? [];
  const results = result ? (
    <>
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
        {/* read-gate-exempt: summary of a finished detection; result is set only when the stream completed, failures show as the error */}
        <span className="font-medium">{regions.length}</span> region
        {regions.length === 1 ? "" : "s"} detected across{" "}
        <span className="font-medium">{result.page_count}</span> page
        {result.page_count === 1 ? "" : "s"}.
      </div>
      <RegionOverlayPreview
        sourcePayload={source.payload}
        regions={regions}
        dpi={renderDpi}
      />
      <PdfJsonResult data={result} title="Detector output" />
    </>
  ) : progress ? (
    <PdfStreamProgress text={progress} />
  ) : null;

  return (
    <PdfWorkbench
      title="Detect repeated regions"
      endpoint="POST /utilities/pdf/detect-repeated-regions"
      description="Find headers / footers / watermarks / recurring side notes across pages. Each region is rendered with a coloured bbox on the first page it covers so you can verify the detector caught the right zones."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      controls={controls}
      results={results}
      error={error}
    />
  );
}
