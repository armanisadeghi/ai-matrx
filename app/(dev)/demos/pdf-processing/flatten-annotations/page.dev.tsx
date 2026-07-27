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

export default function FlattenAnnotationsDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [reason, setReason] = useState("flatten_annotations");
  const [widgets, setWidgets] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const blob = await api.postPdfBlob("flattenAnnotations", {
        ...source.payload,
        reason,
        widgets,
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
      title="Flatten annotations"
      endpoint="POST /utilities/pdf/flatten-annotations"
      description="Bake comments / highlights / sticky notes (and optionally form widgets) into the page content so they can't be edited."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      binaryResult={result}
      error={error}
    >
      <FieldGroup>
        <Field label="Reason">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Field label="Bake form widgets too" hint="default on">
          <select
            value={String(widgets)}
            onChange={(e) => setWidgets(e.target.value === "true")}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="true">Yes — flatten widgets too</option>
            <option value="false">No — annotations only</option>
          </select>
        </Field>
      </FieldGroup>
    </PdfDemoShell>
  );
}
