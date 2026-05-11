"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
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
import { usePdfDemoApi } from "@/features/pdf-demo/hooks/usePdfDemoApi";
import type { RepeatedRegionsReport } from "@/features/pdf-extractor/types";

export default function DetectRepeatedRegionsDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [minPagesRatio, setMinPagesRatio] = useState(0.3333);
  const [minConfidence, setMinConfidence] = useState(0.5);
  const [renderDpi, setRenderDpi] = useState(120);
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

  const controls = (
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
      <Field label="Overlay render DPI" hint="Quality of the page-thumbnails shown with region boxes overlaid">
        <Input
          type="number"
          min={72}
          max={300}
          value={renderDpi}
          onChange={(e) => setRenderDpi(Number(e.target.value) || 120)}
        />
      </Field>
    </FieldGroup>
  );

  const results = result ? (
    <>
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
        <span className="font-medium">{result.regions.length}</span> region
        {result.regions.length === 1 ? "" : "s"} detected across{" "}
        <span className="font-medium">{result.page_count}</span> page
        {result.page_count === 1 ? "" : "s"}.
      </div>
      <RegionOverlayPreview
        sourcePayload={source.payload}
        regions={result.regions}
        dpi={renderDpi}
      />
      <PdfJsonResult data={result} title="Detector output" />
    </>
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
