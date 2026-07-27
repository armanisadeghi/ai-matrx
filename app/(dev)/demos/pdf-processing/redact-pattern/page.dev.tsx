"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { PdfRedactionPatternCatalog } from "@/features/pdf-extractor/types";

export default function RedactPatternDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [catalog, setCatalog] = useState<PdfRedactionPatternCatalog | null>(
    null,
  );
  const [pattern, setPattern] = useState<string>("ssn");
  const [reason, setReason] = useState("HIPAA: remove SSNs before export");
  const [scrubMetadata, setScrubMetadata] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the builtin pattern catalog so the user can pick or type a regex.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c =
          await api.getJson<PdfRedactionPatternCatalog>("redactPatterns");
        if (!cancelled) setCatalog(c);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const blob = await api.postPdfBlob("redactPattern", {
        ...source.payload,
        pattern,
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

  const entries = catalog?.patterns ?? [];
  const activeEntry = entries.find((e) => e.id === pattern);

  return (
    <PdfDemoShell
      title="Redact by pattern"
      endpoint="POST /utilities/pdf/redact-pattern"
      description="Redact every regex match — pick a builtin (SSN / email / phone / MRN / …) or paste a custom regex. The engine refuses to return the file if any match survives."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      binaryResult={result}
      error={error}
      runDisabled={!reason.trim() || !pattern.trim()}
    >
      <FieldGroup>
        <Field
          label="Pattern (builtin id or raw regex)"
          hint={
            activeEntry?.description ??
            "Paste any regex — server uses re.compile(pattern, flags=0)."
          }
        >
          <div className="space-y-2">
            <select
              value={
                entries.some((e) => e.id === pattern) ? pattern : "__custom__"
              }
              onChange={(e) => {
                if (e.target.value === "__custom__") return;
                setPattern(e.target.value);
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.id} — {e.description}
                </option>
              ))}
              <option value="__custom__">Custom regex (type below)</option>
            </select>
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="ssn / email / your regex…"
            />
          </div>
        </Field>
        <Field
          label="Reason"
          hint="Required — written to the pdf_redaction_audits row"
        >
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="why this redaction is running"
          />
        </Field>
      </FieldGroup>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={scrubMetadata}
          onCheckedChange={(v) => setScrubMetadata(v === true)}
        />
        Also scrub metadata + JS + attachments (default on)
      </label>
    </PdfDemoShell>
  );
}
