"use client";

/**
 * PdfDemoShell — uniform page layout for every PDF demo route.
 *
 *   <PdfDemoShell
 *     title="Render page"
 *     endpoint="POST /utilities/pdf/render-page"
 *     description="…"
 *     source={source}
 *     onSourceChange={setSource}
 *     onRun={handleRun}
 *     running={running}
 *     binaryResult={blob}
 *     jsonResult={json}
 *     error={err}
 *   >
 *     <FieldGroup>
 *       <input … />
 *     </FieldGroup>
 *   </PdfDemoShell>
 */

import { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Play, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PdfSourcePicker, type PdfSourceState } from "./PdfSourcePicker";
import { PdfBinaryResult } from "./PdfBinaryResult";
import { PdfJsonResult } from "./PdfJsonResult";
import type { BinaryResult } from "../hooks/usePdfDemoApi";

interface Props {
  title: string;
  endpoint: string;
  description?: string;
  /** Children render the endpoint-specific knobs (children should call the
   * Field / FieldGroup helpers below for consistent spacing). */
  children?: ReactNode;
  source: PdfSourceState;
  onSourceChange: (next: PdfSourceState) => void;
  /** Set to false to hide the source picker (e.g. catalog endpoints). */
  requiresSource?: boolean;
  /** Disable the Run button beyond the source-required check (e.g. when
   * required form fields are still empty). */
  runDisabled?: boolean;
  onRun: () => Promise<void> | void;
  running: boolean;
  binaryResult?: BinaryResult | null;
  jsonResult?: unknown;
  error?: string | null;
  /** Optional extra UI rendered between knobs and Run button. */
  extra?: ReactNode;
}

export function PdfDemoShell({
  title,
  endpoint,
  description,
  children,
  source,
  onSourceChange,
  requiresSource = true,
  runDisabled = false,
  onRun,
  running,
  binaryResult,
  jsonResult,
  error,
  extra,
}: Props) {
  const sourceReady = !requiresSource || source.payload !== null;
  const disabled = running || !sourceReady || runDisabled;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <Link
          href="/ssr/demos/pdf-processing"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to PDF demos
        </Link>
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
            {endpoint}
          </code>
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </header>

      {requiresSource ? (
        <PdfSourcePicker value={source} onChange={onSourceChange} />
      ) : null}

      {children ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          {children}
        </div>
      ) : null}

      {extra}

      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {requiresSource && !source.payload ? "Pick a PDF source first." : null}
        </div>
        <Button onClick={() => onRun()} disabled={disabled} size="lg">
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

      {binaryResult ? <PdfBinaryResult result={binaryResult} /> : null}
      {jsonResult ? <PdfJsonResult data={jsonResult} /> : null}
    </div>
  );
}

/** Field-row helpers — keep all demo forms looking the same. */
export function FieldGroup({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
