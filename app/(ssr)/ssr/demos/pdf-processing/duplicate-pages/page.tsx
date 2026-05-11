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

export default function DuplicatePagesDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [pagesInput, setPagesInput] = useState("1");
  const [count, setCount] = useState(1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const pages = parsePagesInput(pagesInput);
      if (!pages.length) throw new Error("Pick at least one page to duplicate.");
      const blob = await api.postPdfBlob("duplicatePages", {
        ...source.payload,
        pages,
        count,
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
      title="Duplicate pages"
      endpoint="POST /utilities/pdf/duplicate-pages"
      description="Append `count` copies of each selected page directly after the original."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      binaryResult={result}
      error={error}
    >
      <FieldGroup>
        <Field label="Pages to duplicate" hint="Examples: 1 — 2,5 — 1-3">
          <Input
            value={pagesInput}
            onChange={(e) => setPagesInput(e.target.value)}
            placeholder="1"
          />
        </Field>
        <Field label="Copies per page">
          <Input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 1)}
          />
        </Field>
      </FieldGroup>
    </PdfDemoShell>
  );
}
