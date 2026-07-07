"use client";

import { useState } from "react";
import { Field, FieldGroup, PdfDemoShell } from "@/features/pdf-demo/components/PdfDemoShell";
import {
  EMPTY_PDF_SOURCE,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import { drainPdfStream, PdfStreamProgress } from "@/features/pdf/api/streamDrain";
import type { PdfTablesReport } from "@/features/pdf-extractor/types";
import type {
  PdfTableExtractedData,
  PdfTablesPageData,
  PdfTablesStartedData,
} from "@/types/python-generated/stream-events";

const FORMATS = ["csv", "json"] as const;

export default function ExtractTablesDemo() {
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [fmt, setFmt] = useState<(typeof FORMATS)[number]>("csv");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<PdfTablesReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      const report = await drainPdfStream<PdfTablesReport>(
        "/utilities/pdf/extract-tables",
        { ...source.payload, output_format: fmt },
        "pdf_tables_complete",
        {
          onProgress: (d) => {
            if (d.type === "pdf_tables_started") {
              const p = d as PdfTablesStartedData;
              setProgress(`Scanning ${p.total_pages} pages for tables…`);
            } else if (d.type === "pdf_table_extracted") {
              const p = d as PdfTableExtractedData;
              setProgress(
                `Page ${p.page_number}/${p.total_pages} — table #${p.table_index} (${p.row_count}×${p.column_count})`,
              );
            } else if (d.type === "pdf_tables_page") {
              const p = d as PdfTablesPageData;
              setProgress(
                `Page ${p.page_number}/${p.total_pages} — ${p.tables_found} table${p.tables_found === 1 ? "" : "s"} found`,
              );
            }
          },
        },
      );
      setResult(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  return (
    <PdfDemoShell
      title="Extract tables"
      endpoint="POST /utilities/pdf/extract-tables"
      description="Pull tabular data via tabula-py (Java required on the backend). Streams per-table + per-page events; the terminal event carries the full report."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      jsonResult={result}
      error={error}
      extra={progress ? <PdfStreamProgress text={progress} /> : null}
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
