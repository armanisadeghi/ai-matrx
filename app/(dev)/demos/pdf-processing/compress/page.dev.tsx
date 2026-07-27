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

type CompressLevel = 1 | 2 | 3 | 4 | 5;

const LEVEL_LABELS: Record<CompressLevel, string> = {
  1: "1 — lossless (no image recompression)",
  2: "2 — light (touches very large images only)",
  3: "3 — balanced (default for everyday use)",
  4: "4 — aggressive (smaller, visible quality loss)",
  5: "5 — max (smallest, heavy quality loss)",
};

interface CompressMeta {
  levelRequested: number | null;
  levelUsed: number | null;
  capSatisfied: boolean | null;
}

export default function CompressDemo() {
  const backendUrl = useAppSelector(selectResolvedBaseUrl);
  const { getHeaders, waitForAuth } = useApiAuth();
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<CompressLevel>(3);
  const [maxSizeMb, setMaxSizeMb] = useState<number | "">("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [meta, setMeta] = useState<CompressMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    setMeta(null);
    try {
      if (!file) throw new Error("Choose a .pdf file first.");
      await waitForAuth();
      const allHeaders = getHeaders() as Record<string, string>;
      // Drop Content-Type so the browser sets the multipart boundary.
      const { "Content-Type": _drop, ...authHeaders } = allHeaders;
      void _drop;

      const form = new FormData();
      form.append("file", file);

      const params = new URLSearchParams({ level: String(level) });
      if (typeof maxSizeMb === "number" && maxSizeMb > 0) {
        params.set("max_size_mb", String(maxSizeMb));
      }

      const url = `${backendUrl}${ENDPOINTS.pdf.compress}?${params.toString()}`;
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

      const levelRequestedHeader = response.headers.get(
        "X-Compression-Level-Requested",
      );
      const levelUsedHeader = response.headers.get("X-Compression-Level-Used");
      const capSatisfiedHeader = response.headers.get(
        "X-Compression-Cap-Satisfied",
      );
      setMeta({
        levelRequested: levelRequestedHeader
          ? Number(levelRequestedHeader)
          : null,
        levelUsed: levelUsedHeader ? Number(levelUsedHeader) : null,
        capSatisfied:
          capSatisfiedHeader === null ? null : capSatisfiedHeader === "1",
      });
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
          href="/demos/pdf-processing"
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
          Multipart upload — five quality tiers. <strong>Level</strong> is the
          minimum compression tier to apply.{" "}
          <strong>Max size (MB)</strong> is an optional absolute cap; when
          set, the server escalates the level one tier at a time until the
          output fits (or tier 5 is reached). Leave max size blank to honour
          the level exactly.
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
            <span className="font-medium">Level (minimum tier)</span>
            <select
              value={level}
              onChange={(e) =>
                setLevel(Number(e.target.value) as CompressLevel)
              }
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {([1, 2, 3, 4, 5] as const).map((lvl) => (
                <option key={lvl} value={lvl}>
                  {LEVEL_LABELS[lvl]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              Max size (MB){" "}
              <span className="text-muted-foreground">— optional cap</span>
            </span>
            <Input
              type="number"
              min={0}
              step="0.1"
              placeholder="leave blank for no cap"
              value={maxSizeMb}
              onChange={(e) => {
                const v = e.target.value;
                setMaxSizeMb(v === "" ? "" : Number(v));
              }}
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

      {meta && (meta.levelRequested !== null || meta.levelUsed !== null) ? (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Requested level <strong>{meta.levelRequested ?? "?"}</strong>, used
          level <strong>{meta.levelUsed ?? "?"}</strong>
          {meta.levelUsed !== null &&
          meta.levelRequested !== null &&
          meta.levelUsed > meta.levelRequested
            ? " (escalated to fit the size cap)"
            : ""}
          {meta.capSatisfied === false
            ? " — cap not met even at tier 5; this is the smallest tier 5 could produce."
            : ""}
        </div>
      ) : null}

      {result ? <PdfBinaryResult result={result} /> : null}
    </div>
  );
}
