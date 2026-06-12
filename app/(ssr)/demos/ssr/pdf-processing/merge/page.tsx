"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { ArrowLeft, Loader2, Play, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PdfBinaryResult } from "@/features/pdf-demo/components/PdfBinaryResult";
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

interface MergeSource {
  state: PdfSourceState;
  pagesInput: string;
}

export default function MergeDemo() {
  const api = usePdfDemoApi();
  const [sources, setSources] = useState<MergeSource[]>([
    { state: EMPTY_PDF_SOURCE, pagesInput: "" },
    { state: EMPTY_PDF_SOURCE, pagesInput: "" },
  ]);
  const [filename, setFilename] = useState("merged.pdf");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateSource(idx: number, patch: Partial<MergeSource>) {
    setSources((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  }
  function removeSource(idx: number) {
    setSources((prev) => prev.filter((_, i) => i !== idx));
  }
  function addSource() {
    setSources((prev) => [
      ...prev,
      { state: EMPTY_PDF_SOURCE, pagesInput: "" },
    ]);
  }

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const ready = sources.filter((s) => s.state.payload);
      if (ready.length < 1) throw new Error("Add at least one source PDF.");
      const sourcesWire = ready.map((s) => {
        // parsePagesInput supports range syntax ("1-3,7") and throws with a
        // precise message — the previous bare split(",") silently dropped
        // ranges (Number("1-3") → NaN → filtered out → whole PDF merged).
        const pages = s.pagesInput.trim() ? parsePagesInput(s.pagesInput) : null;
        return {
          ...s.state.payload,
          ...(pages && pages.length ? { pages } : {}),
        };
      });
      const blob = await api.postPdfBlob("merge", {
        sources: sourcesWire,
        filename,
      });
      setResult(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="w-full space-y-6 p-6">
      <header className="space-y-2">
        <Link
          href="/demos/ssr/pdf-processing"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to PDF demos
        </Link>
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold">Merge PDFs</h1>
          <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
            POST /utilities/pdf/merge
          </code>
        </div>
        <p className="text-sm text-muted-foreground">
          Concatenate multiple PDFs into one. Each source can optionally filter
          to a subset of pages.
        </p>
      </header>

      <div className="space-y-3">
        {sources.map((s, idx) => (
          <div
            key={idx}
            className="space-y-2 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Source #{idx + 1}</span>
              {sources.length > 1 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSource(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              ) : null}
            </div>
            <PdfSourcePicker
              value={s.state}
              onChange={(state) => updateSource(idx, { state })}
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">
                Pages (optional, comma-separated)
              </span>
              <Input
                value={s.pagesInput}
                onChange={(e) =>
                  updateSource(idx, { pagesInput: e.target.value })
                }
                placeholder="all pages"
              />
            </label>
          </div>
        ))}
        <Button variant="outline" onClick={addSource}>
          <Plus className="h-4 w-4 mr-1" /> Add source
        </Button>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Output filename</span>
        <Input
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
        />
      </label>

      <div className="flex items-center justify-end">
        <Button onClick={run} disabled={running} size="lg">
          {running ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running…
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" /> Run
            </>
          )}
        </Button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <pre className="whitespace-pre-wrap break-words font-mono text-xs">
            {error}
          </pre>
        </div>
      ) : null}

      {result ? <PdfBinaryResult result={result} /> : null}
    </div>
  );
}
