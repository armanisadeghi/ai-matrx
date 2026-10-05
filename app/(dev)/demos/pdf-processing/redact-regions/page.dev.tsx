"use client";

import { ClampedNumberInput } from "@/components/official/ClampedNumberInput";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Input } from "@ai-matrx/design-system";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  PdfDemoShell,
} from "@/features/pdf-demo/components/PdfDemoShell";
import {
  EMPTY_PDF_SOURCE,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import {
  type BinaryResult,
  usePdfDemoApi,
} from "@/features/pdf-demo/hooks/usePdfDemoApi";

interface RegionRow {
  page_number: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  replacement: "BLOCK" | "REMOVE";
  preserve_text: boolean;
}

const EMPTY_REGION: RegionRow = {
  page_number: 1,
  x0: 50,
  y0: 50,
  x1: 562,
  y1: 100,
  replacement: "BLOCK",
  preserve_text: false,
};

export default function RedactRegionsDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [regions, setRegions] = useState<RegionRow[]>([{ ...EMPTY_REGION }]);
  const [reason, setReason] = useState("Manual region redaction");
  const [scrubMetadata, setScrubMetadata] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateRegion(i: number, patch: Partial<RegionRow>) {
    setRegions((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    );
  }

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      if (!regions.length) throw new Error("Add at least one region.");
      const blob = await api.postPdfBlob("redactRegions", {
        ...source.payload,
        regions,
        reason,
        scrub_metadata: scrubMetadata,
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
      title="Redact regions"
      endpoint="POST /utilities/pdf/redact-regions"
      description="Black-out one or more page-anchored rectangles. The engine verifies removal before returning the file."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      binaryResult={result}
      error={error}
      runDisabled={!reason.trim() || regions.length === 0}
      extra={
        <div className="space-y-2">
          {regions.map((r, i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Region #{i + 1}</span>
                {regions.length > 1 ? (
                  <Button
                    icon={<Trash2 />}
                    variant="quiet"
                    onClick={() =>
                      setRegions((prev) => prev.filter((_, j) => j !== i))
                    }
                  > Remove
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <Field label="Page">
                  <ClampedNumberInput value={r.page_number} min={1} onChange={(n) => updateRegion(i, { page_number: n })} />
                </Field>
                <Field label="x0">
                  <ClampedNumberInput value={r.x0} min={Number.MIN_SAFE_INTEGER} decimal onChange={(n) => updateRegion(i, { x0: n })} />
                </Field>
                <Field label="y0">
                  <ClampedNumberInput value={r.y0} min={Number.MIN_SAFE_INTEGER} decimal onChange={(n) => updateRegion(i, { y0: n })} />
                </Field>
                <Field label="x1">
                  <ClampedNumberInput value={r.x1} min={Number.MIN_SAFE_INTEGER} decimal onChange={(n) => updateRegion(i, { x1: n })} />
                </Field>
                <Field label="y1">
                  <ClampedNumberInput value={r.y1} min={Number.MIN_SAFE_INTEGER} decimal onChange={(n) => updateRegion(i, { y1: n })} />
                </Field>
                <Field label="Replacement">
                  <select
                    value={r.replacement}
                    onChange={(e) =>
                      updateRegion(i, {
                        replacement: e.target.value as "BLOCK" | "REMOVE",
                      })
                    }
                    className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                  >
                    <option value="BLOCK">BLOCK (paint)</option>
                    <option value="REMOVE">REMOVE (white)</option>
                  </select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={r.preserve_text}
                  onCheckedChange={(v) =>
                    updateRegion(i, { preserve_text: v === true })
                  }
                />
                preserve_text — strip images/graphics only, keep text glyphs
              </label>
            </div>
          ))}
          <Button
            icon={<Plus />}
            variant="outline"
            onClick={() => setRegions((prev) => [...prev, { ...EMPTY_REGION }])}
          > Add region
          </Button>
        </div>
      }
    >
      <FieldGroup>
        <Field label="Reason" hint="Required — written to pdf_redaction_audits">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </FieldGroup>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={scrubMetadata}
          onCheckedChange={(v) => setScrubMetadata(v === true)}
        />
        Also scrub metadata + JS + attachments
      </label>
    </PdfDemoShell>
  );
}
