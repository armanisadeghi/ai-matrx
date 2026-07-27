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

export default function ExtractPagesDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [pagesInput, setPagesInput] = useState("1");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const pages = parsePagesInput(pagesInput);
      if (!pages.length) throw new Error("Pick at least one page.");
      const blob = await api.postPdfBlob("extractPages", {
        ...source.payload,
        pages,
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
      title="Extract pages"
      endpoint="POST /utilities/pdf/extract-pages"
      description="Pull selected pages into a new PDF. Order is preserved."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      binaryResult={result}
      error={error}
    >
      <FieldGroup>
        <Field
          label="Pages"
          hint="Examples: 1,2,5 — 1-3,7 — leave for first page"
        >
          <Input
            value={pagesInput}
            onChange={(e) => setPagesInput(e.target.value)}
            placeholder="1,3-5,8"
          />
        </Field>
      </FieldGroup>
    </PdfDemoShell>
  );
}
