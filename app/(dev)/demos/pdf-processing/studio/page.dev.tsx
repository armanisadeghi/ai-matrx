"use client";

import { useEffect, useState } from "react";
import { Field, FieldGroup, PdfDemoShell } from "@/features/pdf-demo/components/PdfDemoShell";
import {
  EMPTY_PDF_SOURCE,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import {
  type BinaryResult,
  usePdfDemoApi,
} from "@/features/pdf-demo/hooks/usePdfDemoApi";
import type {
  PdfStudioCatalog,
  PdfStudioPresetSchema,
} from "@/features/pdf-extractor/types";

export default function StudioDemo() {
  const api = usePdfDemoApi();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [catalog, setCatalog] = useState<PdfStudioCatalog | null>(null);
  const [presetId, setPresetId] = useState<string>("render-page-150");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await api.getJson<PdfStudioCatalog>("studioPresets");
        if (!cancelled) setCatalog(c);
      } catch (err) {
        if (!cancelled)
          setCatalogError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const renderPresets: PdfStudioPresetSchema[] = catalog
    ? (catalog.categories ?? [])
        .flatMap((c) => c.presets ?? [])
        .filter((p) =>
          ["render_page", "render_all", "render_thumbnail"].includes(p.operation),
        )
    : [];

  const activePreset = renderPresets.find((p) => p.id === presetId);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const blob = await api.postPdfBlob("studioRender", {
        ...source.payload,
        preset_id: presetId,
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
      title="Studio render"
      endpoint="GET /utilities/pdf/studio/presets · POST /utilities/pdf/studio/render"
      description="One-shot render via a preset id. Studio currently exposes the render-family operations (render_page / render_all / render_thumbnail). Other preset operations route through their dedicated endpoints."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      binaryResult={result}
      error={error || catalogError}
      runDisabled={!presetId}
    >
      <FieldGroup>
        <Field
          label="Preset"
          hint={activePreset?.usage ?? "Pick a preset id from the studio catalog"}
        >
          <select
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {renderPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} — {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Operation (from catalog)">
          <code className="rounded bg-muted px-2 py-1 text-sm text-muted-foreground">
            {activePreset?.operation ?? "—"}
          </code>
        </Field>
      </FieldGroup>
      {activePreset?.params ? (
        <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs">
          <div className="mb-1 font-medium text-foreground">Preset params</div>
          <pre className="text-muted-foreground">
            {JSON.stringify(activePreset.params, null, 2)}
          </pre>
        </div>
      ) : null}
    </PdfDemoShell>
  );
}
