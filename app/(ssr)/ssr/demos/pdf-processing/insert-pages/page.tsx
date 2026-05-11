"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, PdfDemoShell } from "@/features/pdf-demo/components/PdfDemoShell";
import {
  EMPTY_PDF_SOURCE,
  PdfSourcePicker,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import {
  type BinaryResult,
  usePdfDemoApi,
} from "@/features/pdf-demo/hooks/usePdfDemoApi";
import { parsePagesInput } from "@/features/pdf-demo/utils/pages";

export default function InsertPagesDemo() {
  const api = usePdfDemoApi();
  const [target, setTarget] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [src, setSrc] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [afterPage, setAfterPage] = useState(0);
  const [sourcePagesInput, setSourcePagesInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      if (!src.payload) throw new Error("Pick a source PDF (the one to insert from).");
      const pages = sourcePagesInput.trim()
        ? parsePagesInput(sourcePagesInput)
        : undefined;

      // Backend takes source via the source_media / source_file / source_url
      // / source_local_path keys (separate from the target media keys).
      const sourceWire = src.payload.media
        ? { source_media: src.payload.media }
        : src.payload.url
          ? { source_url: src.payload.url }
          : {};

      const blob = await api.postPdfBlob("insertPages", {
        ...target.payload,
        ...sourceWire,
        after_page: afterPage,
        ...(pages ? { source_pages: pages } : {}),
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
      title="Insert pages"
      endpoint="POST /utilities/pdf/insert-pages"
      description="Splice pages from one PDF into another at a chosen position. `after_page=0` prepends."
      source={target}
      onSourceChange={setTarget}
      onRun={run}
      running={running}
      binaryResult={result}
      error={error}
      runDisabled={!src.payload}
      extra={
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-3 text-sm font-medium">Source PDF (pages will be pulled from here)</p>
          <PdfSourcePicker value={src} onChange={setSrc} />
        </div>
      }
    >
      <FieldGroup>
        <Field label="Insert after page (0 = prepend)">
          <Input
            type="number"
            min={0}
            value={afterPage}
            onChange={(e) => setAfterPage(Number(e.target.value) || 0)}
          />
        </Field>
        <Field
          label="Source pages (optional)"
          hint="Examples: 1,2,5 — 1-3,7 — blank for all source pages"
        >
          <Input
            value={sourcePagesInput}
            onChange={(e) => setSourcePagesInput(e.target.value)}
            placeholder="all source pages"
          />
        </Field>
      </FieldGroup>
    </PdfDemoShell>
  );
}
