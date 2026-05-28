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
import { parsePagesInput } from "@/features/pdf-demo/utils/pages";

const FORMATS = ["png", "jpg", "jpeg", "webp", "tiff"] as const;

export default function RenderAllDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [dpi, setDpi] = useState(150);
  const [fmt, setFmt] = useState<(typeof FORMATS)[number]>("png");
  const [jpegQuality, setJpegQuality] = useState(85);
  const [pagesInput, setPagesInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const pages = pagesInput.trim() ? parsePagesInput(pagesInput) : null;
      const blob = await api.postPdfBlob("renderAll", {
        ...source.payload,
        dpi,
        fmt,
        jpeg_quality: jpegQuality,
        ...(pages ? { pages } : {}),
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
      title="Render all pages → ZIP"
      endpoint="POST /utilities/pdf/render-all"
      description="Render every page (or a subset) to images, bundled in a ZIP archive."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      binaryResult={result}
      error={error}
    >
      <FieldGroup>
        <Field label="DPI">
          <Input
            type="number"
            min={36}
            max={600}
            value={dpi}
            onChange={(e) => setDpi(Number(e.target.value) || 150)}
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
            onChange={(e) => setJpegQuality(Number(e.target.value) || 85)}
          />
        </Field>
        <Field
          label="Pages (optional)"
          hint="Examples: 1,2,5 — 1-3,7 — leave empty for all pages"
        >
          <Input
            value={pagesInput}
            onChange={(e) => setPagesInput(e.target.value)}
            placeholder="all pages"
          />
        </Field>
      </FieldGroup>
    </PdfDemoShell>
  );
}
