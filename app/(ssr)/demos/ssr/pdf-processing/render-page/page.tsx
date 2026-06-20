"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldGroup,
  PdfDemoShell,
} from "@/features/pdf-demo/components/PdfDemoShell";
import {
  EMPTY_PDF_SOURCE,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import {
  type BinaryResult,
  usePdfDemoApi,
} from "@/features/pdf-demo/hooks/usePdfDemoApi";

const FORMATS = ["png", "jpg", "jpeg", "webp", "tiff"] as const;

export default function RenderPageDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [page, setPage] = useState(1);
  const [dpi, setDpi] = useState(150);
  const [fmt, setFmt] = useState<(typeof FORMATS)[number]>("png");
  const [jpegQuality, setJpegQuality] = useState(85);
  const [alpha, setAlpha] = useState(false);
  const [annotations, setAnnotations] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const blob = await api.postPdfBlob("renderPage", {
        ...source.payload,
        page,
        dpi,
        fmt,
        jpeg_quality: jpegQuality,
        alpha,
        annotations,
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
      title="Render page"
      endpoint="POST /utilities/pdf/render-page"
      description="Render a single page to an image (PNG / JPEG / WebP / TIFF)."
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
        <Field label="DPI" hint="72 = screen, 150 = retina, 300 = print">
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
        <Field label="JPEG / WebP quality" hint="1–100, ignored for PNG/TIFF">
          <Input
            type="number"
            min={1}
            max={100}
            value={jpegQuality}
            onChange={(e) => setJpegQuality(Number(e.target.value) || 85)}
          />
        </Field>
      </FieldGroup>
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={alpha}
            onCheckedChange={(v) => setAlpha(v === true)}
          />
          Alpha channel
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={annotations}
            onCheckedChange={(v) => setAnnotations(v === true)}
          />
          Include annotations
        </label>
      </div>
    </PdfDemoShell>
  );
}
