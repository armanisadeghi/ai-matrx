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

const ROTATIONS = [90, 180, 270, -90] as const;

export default function RotatePagesDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [pagesInput, setPagesInput] = useState("");
  const [rotation, setRotation] = useState<number>(90);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const pages = pagesInput.trim() ? parsePagesInput(pagesInput) : undefined;
      const blob = await api.postPdfBlob("rotatePages", {
        ...source.payload,
        ...(pages ? { pages } : {}),
        rotation,
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
      title="Rotate pages"
      endpoint="POST /utilities/pdf/rotate-pages"
      description="Rotate the selected pages by 90°, 180°, or 270°. Leave pages blank to apply to every page."
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
        <Field label="Rotation (degrees, multiple of 90)">
          <select
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {ROTATIONS.map((r) => (
              <option key={r} value={r}>
                {r > 0 ? `+${r}` : r}°
              </option>
            ))}
          </select>
        </Field>
      </FieldGroup>
    </PdfDemoShell>
  );
}
