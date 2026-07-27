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

export default function CropPagesDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [pagesInput, setPagesInput] = useState("");
  const [x0, setX0] = useState(0);
  const [y0, setY0] = useState(0);
  const [x1, setX1] = useState(612);
  const [y1, setY1] = useState(792);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const pages = pagesInput.trim() ? parsePagesInput(pagesInput) : undefined;
      const blob = await api.postPdfBlob("cropPages", {
        ...source.payload,
        ...(pages ? { pages } : {}),
        crop_box: { x0, y0, x1, y1 },
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
      title="Crop pages"
      endpoint="POST /utilities/pdf/crop-pages"
      description="Crop pages to a bounding box (PDF coordinates, points; default is US Letter 612 × 792)."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      binaryResult={result}
      error={error}
    >
      <FieldGroup>
        <Field label="Pages (optional)" hint="Blank = all pages">
          <Input
            value={pagesInput}
            onChange={(e) => setPagesInput(e.target.value)}
            placeholder="all pages"
          />
        </Field>
        <div className="grid grid-cols-4 gap-2 sm:col-span-2">
          <Field label="x0">
            <Input
              type="number"
              value={x0}
              onChange={(e) => setX0(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="y0">
            <Input
              type="number"
              value={y0}
              onChange={(e) => setY0(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="x1">
            <Input
              type="number"
              value={x1}
              onChange={(e) => setX1(Number(e.target.value) || 612)}
            />
          </Field>
          <Field label="y1">
            <Input
              type="number"
              value={y1}
              onChange={(e) => setY1(Number(e.target.value) || 792)}
            />
          </Field>
        </div>
      </FieldGroup>
    </PdfDemoShell>
  );
}
