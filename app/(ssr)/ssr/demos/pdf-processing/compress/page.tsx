"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Play, AlertTriangle } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useApiAuth } from "@/hooks/useApiAuth";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { PdfBinaryResult } from "@/features/pdf-demo/components/PdfBinaryResult";
import { type BinaryResult } from "@/features/pdf-demo/hooks/usePdfDemoApi";

export default function CompressDemo() {
  const backendUrl = useAppSelector(selectResolvedBaseUrl);
  const { getHeaders, waitForAuth } = useApiAuth();
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<1 | 2 | 3>(2);
  const [targetSizeMb, setTargetSizeMb] = useState(10);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      if (!file) throw new Error("Choose a .pdf file first.");
      await waitForAuth();
      const allHeaders = getHeaders() as Record<string, string>;
      // Drop Content-Type so the browser sets the multipart boundary.
      const { "Content-Type": _drop, ...authHeaders } = allHeaders;
      void _drop;

      const form = new FormData();
      form.append("file", file);
      const url = `${backendUrl}${ENDPOINTS.pdf.compress}?level=${level}&target_size_mb=${targetSizeMb}`;
      const response = await fetch(url, {
        method: "POST",
        headers: authHeaders,
        body: form,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => response.statusText);
        throw new Error(
          `POST compress → ${response.status}: ${detail.slice(0, 600)}`,
        );
      }
      const blob = await response.blob();
      const contentType =
        response.headers.get("content-type") || "application/pdf";
      setResult({ blob, filename: `compressed_${file.name}`, contentType });
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
          href="/ssr/demos/pdf-processing"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to PDF demos
        </Link>
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold">Compress PDF</h1>
          <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
            POST /utilities/pdf/compress
          </code>
        </div>
        <p className="text-sm text-muted-foreground">
          Multipart upload — three quality tiers. Level 1 is lossless, 2 is the
          balanced default, 3 re-encodes images aggressively + strips metadata.
        </p>
      </header>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">PDF file (multipart upload)</span>
          <Input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Level</span>
            <select
              value={level}
              onChange={(e) => setLevel(Number(e.target.value) as 1 | 2 | 3)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value={1}>1 — lossless</option>
              <option value={2}>2 — balanced (default)</option>
              <option value={3}>3 — aggressive</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Target size (MB)</span>
            <Input
              type="number"
              min={1}
              step={1}
              value={targetSizeMb}
              onChange={(e) => setTargetSizeMb(Number(e.target.value) || 10)}
            />
          </label>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Button onClick={run} disabled={running || !file} size="lg">
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
