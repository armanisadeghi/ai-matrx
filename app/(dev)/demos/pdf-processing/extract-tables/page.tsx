"use client";

import { useState } from "react";
import { Field, FieldGroup, PdfDemoShell } from "@/features/pdf-demo/components/PdfDemoShell";
import {
  EMPTY_PDF_SOURCE,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import { usePdfDemoApi } from "@/features/pdf-demo/hooks/usePdfDemoApi";
import type { PdfResult } from "@/features/pdf-extractor/types";

const FORMATS = ["csv", "json"] as const;

export default function ExtractTablesDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [fmt, setFmt] = useState<(typeof FORMATS)[number]>("csv");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PdfResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const json = await api.postJson<PdfResult>("extractTables", {
        ...source.payload,
        output_format: fmt,
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
      title="Extract tables"
      endpoint="POST /utilities/pdf/extract-tables"
      description="Pull tabular data via tabula-py (Java required on the backend). The response carries `tables_path` pointing at the generated file."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      jsonResult={result}
      error={error}
    >
      <FieldGroup>
        <Field label="Output format">
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
      </FieldGroup>
    </PdfDemoShell>
  );
}
