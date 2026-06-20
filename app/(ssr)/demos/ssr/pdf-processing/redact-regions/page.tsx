"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
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
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setRegions((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <Field label="Page">
                  <Input
                    type="number"
                    min={1}
                    value={r.page_number}
                    onChange={(e) =>
                      updateRegion(i, {
                        page_number: Number(e.target.value) || 1,
                      })
                    }
                  />
                </Field>
                <Field label="x0">
                  <Input
                    type="number"
                    value={r.x0}
                    onChange={(e) =>
                      updateRegion(i, { x0: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
                <Field label="y0">
                  <Input
                    type="number"
                    value={r.y0}
                    onChange={(e) =>
                      updateRegion(i, { y0: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
                <Field label="x1">
                  <Input
                    type="number"
                    value={r.x1}
                    onChange={(e) =>
                      updateRegion(i, { x1: Number(e.target.value) || 612 })
                    }
                  />
                </Field>
                <Field label="y1">
                  <Input
                    type="number"
                    value={r.y1}
                    onChange={(e) =>
                      updateRegion(i, { y1: Number(e.target.value) || 100 })
                    }
                  />
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
            variant="outline"
            size="sm"
            onClick={() => setRegions((prev) => [...prev, { ...EMPTY_REGION }])}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add region
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
