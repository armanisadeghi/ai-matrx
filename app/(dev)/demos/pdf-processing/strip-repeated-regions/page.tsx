"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, PdfDemoShell } from "@/features/pdf-demo/components/PdfDemoShell";
import {
  EMPTY_PDF_SOURCE,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import { drainPdfStream, PdfStreamProgress } from "@/features/pdf/api/streamDrain";
import type { StripRepeatedRegionsResultSchema } from "@/features/pdf-extractor/types";
import type { PdfRepeatedRegionsProgressData } from "@/types/python-generated/stream-events";

const STAGE_LABELS: Record<PdfRepeatedRegionsProgressData["stage"], string> = {
  detect: "Detecting regions",
  extract_text: "Extracting text",
  strip: "Stripping regions",
};

export default function StripRepeatedRegionsDemo() {
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [minPagesRatio, setMinPagesRatio] = useState(0.3333);
  const [minConfidence, setMinConfidence] = useState(0.5);
  const [acceptedIds, setAcceptedIds] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<StripRepeatedRegionsResultSchema | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      const ids = acceptedIds.trim()
        ? acceptedIds.split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      // Terminal payload is FLATTENED vs the old blocking body — page_count /
      // regions / detector_version are top-level, no nested `regions` report.
      const report = await drainPdfStream<StripRepeatedRegionsResultSchema>(
        "/utilities/pdf/strip-repeated-regions",
        {
          ...source.payload,
          min_pages_ratio: minPagesRatio,
          min_confidence: minConfidence,
          ...(ids ? { accepted_region_ids: ids } : {}),
        },
        "pdf_repeated_regions_strip_complete",
        {
          onProgress: (d) => {
            if (d.type === "pdf_repeated_regions_progress") {
              const p = d as PdfRepeatedRegionsProgressData;
              setProgress(
                `${STAGE_LABELS[p.stage] ?? p.stage} — page ${p.page_number}/${p.total_pages}`,
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
      title="Strip repeated regions"
      endpoint="POST /utilities/pdf/strip-repeated-regions"
      description="Detect + strip recurring headers/footers from per-page text in one call. Pass `accepted_region_ids` to only remove a subset."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      jsonResult={result}
      error={error}
      extra={progress ? <PdfStreamProgress text={progress} /> : null}
    >
      <FieldGroup>
        <Field label="Min pages ratio">
          <Input
            type="number"
            step={0.05}
            min={0}
            max={1}
            value={minPagesRatio}
            onChange={(e) => setMinPagesRatio(Number(e.target.value) || 0.3333)}
          />
        </Field>
        <Field label="Min confidence">
          <Input
            type="number"
            step={0.05}
            min={0}
            max={1}
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value) || 0.5)}
          />
        </Field>
        <Field
          label="Accepted region IDs (optional)"
          hint="Comma-separated; blank = strip every detected region"
        >
          <Input
            value={acceptedIds}
            onChange={(e) => setAcceptedIds(e.target.value)}
            placeholder="leave blank for all"
          />
        </Field>
      </FieldGroup>
    </PdfDemoShell>
  );
}
