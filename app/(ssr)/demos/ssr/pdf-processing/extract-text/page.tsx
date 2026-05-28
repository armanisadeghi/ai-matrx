"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, PdfDemoShell } from "@/features/pdf-demo/components/PdfDemoShell";
import {
  EMPTY_PDF_SOURCE,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import { usePdfDemoApi } from "@/features/pdf-demo/hooks/usePdfDemoApi";
import type { PdfResult } from "@/features/pdf-extractor/types";

export default function ExtractTextDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [forceOcr, setForceOcr] = useState(false);
  const [ocrThreshold, setOcrThreshold] = useState(100);
  const [pageMetadata, setPageMetadata] = useState(true);
  const [blockMetadata, setBlockMetadata] = useState(false);
  const [wordMetadata, setWordMetadata] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PdfResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const json = await api.postJson<PdfResult>("extractTextRemote", {
        ...source.payload,
        force_ocr: forceOcr,
        use_ocr_threshold: ocrThreshold,
        include_page_metadata: pageMetadata,
        include_block_metadata: blockMetadata,
        include_word_metadata: wordMetadata,
      });
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <PdfDemoShell
      title="Extract text (remote)"
      endpoint="POST /utilities/pdf/extract-text-remote"
      description="Per-page text + optional bbox metadata. OCRs pages with fewer than `threshold` native characters."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      jsonResult={result}
      error={error}
    >
      <FieldGroup>
        <Field
          label="OCR threshold (chars)"
          hint="Pages with fewer native chars get OCR'd"
        >
          <Input
            type="number"
            min={0}
            value={ocrThreshold}
            onChange={(e) => setOcrThreshold(Number(e.target.value) || 100)}
          />
        </Field>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={forceOcr}
              onChange={(e) => setForceOcr(e.target.checked)}
            />
            Force OCR (every page)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={pageMetadata}
              onChange={(e) => setPageMetadata(e.target.checked)}
            />
            Include page metadata
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={blockMetadata}
              onChange={(e) => setBlockMetadata(e.target.checked)}
            />
            Include block bboxes
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={wordMetadata}
              onChange={(e) => setWordMetadata(e.target.checked)}
            />
            Include word bboxes
          </label>
        </div>
      </FieldGroup>
    </PdfDemoShell>
  );
}
