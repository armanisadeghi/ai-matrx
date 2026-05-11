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

export default function ReorderPagesDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [orderInput, setOrderInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const newOrder = orderInput
        .split(",")
        .map((s) => Number(s.trim()))
        .filter(Boolean);
      if (!newOrder.length) throw new Error("Supply a comma-separated page order.");
      if (newOrder.some((n) => !Number.isInteger(n) || n < 1)) {
        throw new Error("Page numbers must be 1-based integers.");
      }
      const blob = await api.postPdfBlob("reorderPages", {
        ...source.payload,
        new_order: newOrder,
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
      title="Reorder pages"
      endpoint="POST /utilities/pdf/reorder-pages"
      description="Rearrange every page in the document. The new order must include every page exactly once."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      binaryResult={result}
      error={error}
    >
      <FieldGroup>
        <Field
          label="New order (comma-separated, must cover every page)"
          hint="Example for a 4-page doc: 3,1,4,2"
        >
          <Input
            value={orderInput}
            onChange={(e) => setOrderInput(e.target.value)}
            placeholder="3,1,4,2"
          />
        </Field>
      </FieldGroup>
    </PdfDemoShell>
  );
}
