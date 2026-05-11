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

export default function ScrubDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [metadata, setMetadata] = useState(true);
  const [attachments, setAttachments] = useState(true);
  const [javascript, setJavascript] = useState(true);
  const [flatten, setFlatten] = useState(false);
  const [reason, setReason] = useState("outbound scrub");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const blob = await api.postPdfBlob("scrub", {
        ...source.payload,
        metadata,
        attachments,
        javascript,
        flatten_annotations: flatten,
        reason,
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
      title="Scrub (composite privacy strip)"
      endpoint="POST /utilities/pdf/scrub"
      description="Granular privacy strip. Each flag controls one PII surface independently — opt into only what you want."
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
      </FieldGroup>
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={metadata}
            onChange={(e) => setMetadata(e.target.checked)}
          />
          Strip metadata (/Info + XMP + thumbnails)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={attachments}
            onChange={(e) => setAttachments(e.target.checked)}
          />
          Strip attachments + embedded files
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={javascript}
            onChange={(e) => setJavascript(e.target.checked)}
          />
          Strip JavaScript actions
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={flatten}
            onChange={(e) => setFlatten(e.target.checked)}
          />
          Flatten annotations + widgets
        </label>
      </div>
    </PdfDemoShell>
  );
}
