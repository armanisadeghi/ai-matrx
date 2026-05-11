"use client";

/**
 * PdfWorkbench — full-width split-pane demo layout.
 *
 * Left pane:
 *   - `PdfSourcePicker` when no source is set yet (Upload / Cloud / URL).
 *   - `PdfPreview` (the canonical viewer that wraps `PdfDocumentRenderer`)
 *     once a `file_id` is in hand. Drives scroll-sync via `pageNumber`.
 *   - An optional caller-provided `overlay` rendered ON TOP of the
 *     viewer — used by `/detect-repeated-regions` to draw bbox boxes.
 *
 * Right pane:
 *   - Page header (title, endpoint, description, run button).
 *   - Caller-provided `controls` (the endpoint-specific knobs).
 *   - Caller-provided `results` (binary preview, JSON viewer, custom UI).
 *   - Error pane.
 *
 * Side effects:
 *   - Mounts `useCloudTree(userId)` so the cloud-files tree is hydrated
 *     before the user opens the picker. Without this, the picker shows
 *     an empty list on a fresh demo page.
 */

import { ReactNode, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Play,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useCloudTree } from "@/features/files/hooks/useCloudTree";

import {
  PdfSourcePicker,
  type PdfSourceState,
} from "./PdfSourcePicker";

// react-pdf is heavy; lazy-load the previewer so the workbench itself
// renders fast even when the user hasn't picked a PDF yet.
const PdfPreview = dynamic(
  () =>
    import(
      "@/features/files/components/core/FilePreview/previewers/PdfPreview"
    ),
  { ssr: false, loading: () => <PreviewSkeleton /> },
);

interface Props {
  title: string;
  endpoint: string;
  description?: string;
  source: PdfSourceState;
  onSourceChange: (next: PdfSourceState) => void;
  requiresSource?: boolean;
  runDisabled?: boolean;
  onRun: () => Promise<void> | void;
  running: boolean;
  /** Demo-specific controls (form fields). */
  controls?: ReactNode;
  /** Demo-specific result output (binary viewer, JSON viewer, custom). */
  results?: ReactNode;
  /** Optional overlay rendered ON TOP of the PDF viewer — used to draw
   * region boxes, highlights, etc. Must position itself absolutely. */
  overlay?: ReactNode;
  /** Controlled page number forwarded to the PdfPreview. */
  pageNumber?: number;
  onPageChange?: (page: number) => void;
  error?: string | null;
}

export function PdfWorkbench({
  title,
  endpoint,
  description,
  source,
  onSourceChange,
  requiresSource = true,
  runDisabled = false,
  onRun,
  running,
  controls,
  results,
  overlay,
  pageNumber,
  onPageChange,
  error,
}: Props) {
  // Make sure the cloud-files tree is loaded so the picker isn't empty.
  const userId = useAppSelector(selectUserId);
  useCloudTree(userId);

  const fileId = source.payload?.media?.file_id ?? null;
  const sourceUrl = source.payload?.url ?? null;
  const sourceReady = !requiresSource || source.payload !== null;
  const disabled = running || !sourceReady || runDisabled;

  function resetSource() {
    onSourceChange({ payload: null, label: "" });
  }

  return (
    <div className="flex h-[calc(100dvh-var(--header-height))] w-full flex-col overflow-hidden bg-textured">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-background/70 px-4 py-2 backdrop-blur">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <Link
              href="/ssr/demos/pdf-processing"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            <code className="hidden truncate rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground sm:inline-block">
              {endpoint}
            </code>
          </div>
          {description ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <Button onClick={() => onRun()} disabled={disabled} size="sm">
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Running
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 mr-1.5" /> Run
            </>
          )}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-row">
        {/* ── Left pane: source picker / PDF viewer ── */}
        <aside className="flex w-1/2 min-w-[400px] flex-col border-r border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="min-w-0 truncate text-xs font-medium text-muted-foreground">
              {source.payload ? source.label : "Source"}
            </div>
            {source.payload ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetSource}
                className="h-6 px-2 text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Change
              </Button>
            ) : null}
          </div>
          <div className="relative min-h-0 flex-1">
            {!source.payload ? (
              <div className="p-4">
                <PdfSourcePicker value={source} onChange={onSourceChange} />
              </div>
            ) : fileId ? (
              <>
                <PdfPreview
                  fileId={fileId}
                  className="h-full w-full"
                  pageNumber={pageNumber}
                  onPageChange={onPageChange}
                />
                {overlay}
              </>
            ) : sourceUrl ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  URL source — preview is skipped because the file isn't in
                  cld_files.
                </p>
                <code className="break-all rounded bg-muted px-3 py-2 text-xs">
                  {sourceUrl}
                </code>
              </div>
            ) : null}
          </div>
        </aside>

        {/* ── Right pane: knobs + results ── */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-4 p-4">
              {controls ? (
                <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                  {controls}
                </div>
              ) : null}

              {error ? (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                    {error}
                  </pre>
                </div>
              ) : null}

              {results}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/30">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// Field helpers kept compatible with the old PdfDemoShell consumers.
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
