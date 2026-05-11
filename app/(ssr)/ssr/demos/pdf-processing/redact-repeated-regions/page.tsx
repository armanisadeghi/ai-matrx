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

export default function RedactRepeatedRegionsDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [reason, setReason] = useState("FOIA release — strip running header");
  const [minPagesRatio, setMinPagesRatio] = useState(0.3333);
  const [minConfidence, setMinConfidence] = useState(0.5);
  const [acceptedIds, setAcceptedIds] = useState("");
  const [scrubMetadata, setScrubMetadata] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const ids = acceptedIds.trim()
        ? acceptedIds.split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      const blob = await api.postPdfBlob("redactRepeatedRegions", {
        ...source.payload,
        reason,
        min_pages_ratio: minPagesRatio,
        min_confidence: minConfidence,
        scrub_metadata: scrubMetadata,
        ...(ids ? { accepted_region_ids: ids } : {}),
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
      title="Redact repeated regions"
      endpoint="POST /utilities/pdf/redact-repeated-regions"
      description="One shot: detect headers/footers/watermarks, then redact the accepted set. Pass region IDs (from /detect-repeated-regions) to redact a subset; blank = redact all."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      binaryResult={result}
      error={error}
      runDisabled={!reason.trim()}
    >
      <FieldGroup>
        <Field label="Reason">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Field
          label="Accepted region IDs (optional)"
          hint="Blank = redact every detected region"
        >
          <Input
            value={acceptedIds}
            onChange={(e) => setAcceptedIds(e.target.value)}
            placeholder="e.g. ab12cd34,ef56gh78"
          />
        </Field>
        <Field label="Min pages ratio">
          <Input
            type="number"
            step={0.05}
            min={0}
            max={1}
            value={minPagesRatio}
            onChange={(e) => setMinPagesRatio(Number(e.target.value) || 0.3333)}
          />
        </Field>
        <Field label="Min confidence">
          <Input
            type="number"
            step={0.05}
            min={0}
            max={1}
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value) || 0.5)}
          />
        </Field>
      </FieldGroup>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={scrubMetadata}
          onChange={(e) => setScrubMetadata(e.target.checked)}
        />
        Also scrub metadata + JS + attachments
      </label>
    </PdfDemoShell>
  );
}
