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

export default function SplitDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [maxPagesPerPart, setMaxPagesPerPart] = useState<number | "">("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const body: Record<string, unknown> = { ...source.payload };
      if (maxPagesPerPart !== "" && maxPagesPerPart > 0) {
        body.max_pages_per_part = maxPagesPerPart;
      }
      const blob = await api.postPdfBlob("split", body);
      setResult(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <PdfDemoShell
      title="Split PDF → ZIP"
      endpoint="POST /utilities/pdf/split"
      description="Burst a PDF into per-page files (default) or fixed-size chunks. Returns a ZIP."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      binaryResult={result}
      error={error}
    >
      <FieldGroup>
        <Field
          label="Max pages per part (optional)"
          hint="Blank = one file per page"
        >
          <Input
            type="number"
            min={1}
            value={maxPagesPerPart}
            onChange={(e) =>
              setMaxPagesPerPart(
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
            placeholder="one page per part"
          />
        </Field>
      </FieldGroup>
    </PdfDemoShell>
  );
}
