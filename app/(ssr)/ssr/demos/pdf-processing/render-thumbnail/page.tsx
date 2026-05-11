"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, PdfDemoShell } from "@/features/pdf-demo/components/PdfDemoShell";
import {
  EMPTY_PDF_SOURCE,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import {
  type BinaryResult,
  usePdfDemoApi,
} from "@/features/pdf-demo/hooks/usePdfDemoApi";

const FORMATS = ["png", "jpg", "jpeg", "webp"] as const;

export default function RenderThumbnailDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [page, setPage] = useState(1);
  const [maxSide, setMaxSide] = useState(256);
  const [fmt, setFmt] = useState<(typeof FORMATS)[number]>("jpeg");
  const [jpegQuality, setJpegQuality] = useState(80);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const blob = await api.postPdfBlob("renderThumbnail", {
        ...source.payload,
        page,
        max_side: maxSide,
        fmt,
        jpeg_quality: jpegQuality,
      });
      setResult(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <PdfDemoShell
      title="Render thumbnail"
      endpoint="POST /utilities/pdf/render-thumbnail"
      description="Generate a small thumbnail of a page (cld_files-grid-ready)."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      binaryResult={result}
      error={error}
    >
      <FieldGroup>
        <Field label="Page (1-based)">
          <Input
            type="number"
            min={1}
            value={page}
            onChange={(e) => setPage(Number(e.target.value) || 1)}
          />
        </Field>
        <Field label="Max side (px)" hint="Longest edge of the output">
          <Input
            type="number"
            min={32}
            max={2048}
            value={maxSide}
            onChange={(e) => setMaxSide(Number(e.target.value) || 256)}
          />
        </Field>
        <Field label="Format">
          <select
            value={fmt}
            onChange={(e) => setFmt(e.target.value as (typeof FORMATS)[number])}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="JPEG / WebP quality">
          <Input
            type="number"
            min={1}
            max={100}
            value={jpegQuality}
            onChange={(e) => setJpegQuality(Number(e.target.value) || 80)}
          />
        </Field>
      </FieldGroup>
    </PdfDemoShell>
  );
}
