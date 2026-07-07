"use client";

/**
 * PdfStudioUpload — embeddable upload UI for the studio.
 *
 * Two consumers:
 *   1. The reader's empty state (full-bleed, primary CTA when no doc is open).
 *   2. A drawer triggered by the sidebar's `+ Add` button (always-available).
 *
 * State / streaming is reused from the existing `usePdfExtractor` hook —
 * `addFiles`, `extractFiles`, `selectedFiles`, `batchStatus`, `tabs`,
 * `clearFiles`, `removeFile`, `fileInputRef` are all already wired to the
 * Python `/utilities/pdf/batch-extract` NDJSON streaming endpoint.
 *
 * Per-file progress is read off `extractor.tabs` — we filter to the tabs
 * created by THIS upload session via the `placeholderIdsRef` plumbing.
 *
 * The shell watches the same `tabs` array externally for the first newly-
 * `done` row and auto-selects it, so the user "instantly sees" their
 * upload in the reader.
 */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Upload,
  Loader2,
  FileText,
  X,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ScanLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { usePdfExtractor } from "../hooks/usePdfExtractor";

type Extractor = ReturnType<typeof usePdfExtractor>;

interface PdfStudioUploadProps {
  extractor: Extractor;
  /** Called after extractFiles() resolves with the list of NEW doc ids. */
  onUploadComplete?: (newDocIds: string[]) => void;
  /** Called the moment the FIRST file completes (for fast hand-off). */
  onFirstDocReady?: (docId: string) => void;
  /** Compact / hero variant. */
  variant?: "hero" | "compact";
  /** Optional header text shown above the drop zone. */
  headline?: string;
  subhead?: string;
}

export function PdfStudioUpload({
  extractor,
  onUploadComplete,
  onFirstDocReady,
  variant = "hero",
  headline,
  subhead,
}: PdfStudioUploadProps) {
  const isExtracting = extractor.batchStatus === "extracting";

  // Track the placeholder ids belonging to THIS upload session, so the
  // progress list shows only files the user just added — not stray tabs
  // from elsewhere in the studio. Populated while extracting: a placeholder
  // keeps its id in the `extracting`/`error` states (only `done` tabs morph
  // their id to the doc id), so watching for `extracting` tabs captures the
  // session accurately without the stale-closure races the old code had.
  const sessionTabIdsRef = useRef<Set<string>>(new Set());

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) extractor.addFiles(files);
      e.target.value = "";
    },
    [extractor],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) extractor.addFiles(files);
    },
    [extractor],
  );

  const handleExtract = useCallback(async () => {
    if (extractor.selectedFiles.length === 0) return;

    sessionTabIdsRef.current = new Set();

    // Route the moment the FIRST file's `doc_id` lands — the hook fires this
    // from inside the stream, before/independent of the detail fetch, so the
    // hand-off can't be blocked by a read that momentarily returns null.
    // `extractFiles` resolves with the ids of every file that completed.
    const newIds = await extractor.extractFiles({
      onFirstDocId: (docId) => onFirstDocReady?.(docId),
    });

    onUploadComplete?.(newIds);
  }, [extractor, onUploadComplete, onFirstDocReady]);

  // Capture this session's placeholder ids while the batch runs. Placeholder
  // tabs hold their id in the `extracting`/`error` states, so this scopes the
  // progress list to the current upload without matching on the morphing
  // done-id.
  useEffect(() => {
    if (!isExtracting) return;
    for (const t of extractor.tabs) {
      if (t.status === "extracting") sessionTabIdsRef.current.add(t.id);
    }
  }, [extractor.tabs, isExtracting]);

  // Visible progress rows — the in-flight / failed files from this session.
  // Done files vanish from here because the studio routes to (or auto-selects)
  // the new doc the instant it's ready.
  const progressRows = useMemo(
    () =>
      extractor.tabs.filter(
        (t) =>
          sessionTabIdsRef.current.has(t.id) &&
          (t.status === "extracting" || t.status === "error"),
      ),
    [extractor.tabs],
  );

  return (
    <div
      className={cn(
        "w-full mx-auto",
        variant === "hero" ? "max-w-2xl" : "max-w-md",
      )}
    >
      {(headline || subhead) && variant === "hero" && (
        <div className="text-center mb-4 px-4">
          {headline && (
            <h2 className="text-base font-semibold text-foreground mb-1">
              {headline}
            </h2>
          )}
          {subhead && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {subhead}
            </p>
          )}
        </div>
      )}

      <input
        ref={extractor.fileInputRef}
        type="file"
        accept=".pdf,image/*"
        multiple
        onChange={handleFileInputChange}
        disabled={isExtracting}
        className="hidden"
      />

      {/* Selected-files state */}
      {extractor.selectedFiles.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {extractor.selectedFiles.length} file
              {extractor.selectedFiles.length !== 1 ? "s" : ""} ready
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => extractor.fileInputRef.current?.click()}
                disabled={isExtracting}
                className="px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border rounded hover:bg-accent transition-colors disabled:opacity-50"
              >
                Add more
              </button>
              <button
                type="button"
                onClick={extractor.clearFiles}
                disabled={isExtracting}
                className="p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors rounded disabled:opacity-50"
                title="Clear all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div
            className={cn(
              "space-y-1 overflow-y-auto scrollbar-thin",
              variant === "hero" ? "max-h-[260px]" : "max-h-[180px]",
            )}
          >
            {extractor.selectedFiles.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-2 px-2 py-1.5 bg-muted/40 border border-border rounded-md"
              >
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium truncate">
                    {file.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => extractor.removeFile(i)}
                  disabled={isExtracting}
                  className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors rounded disabled:opacity-50"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <Button
            onClick={handleExtract}
            disabled={isExtracting || extractor.selectedFiles.length === 0}
            size="sm"
            className="w-full h-9 text-xs"
          >
            {isExtracting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Extracting…
              </>
            ) : (
              <>
                Extract {extractor.selectedFiles.length}{" "}
                {extractor.selectedFiles.length === 1 ? "file" : "files"}
              </>
            )}
          </Button>
        </div>
      ) : (
        // Drop zone state
        <button
          type="button"
          onClick={() => extractor.fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          disabled={isExtracting}
          className={cn(
            "w-full flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl hover:border-primary/40 hover:bg-muted/20 transition-colors cursor-pointer group disabled:opacity-50",
            variant === "hero" ? "py-12 px-6" : "py-8 px-4",
          )}
        >
          <div
            className={cn(
              "rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors",
              variant === "hero" ? "w-14 h-14" : "w-10 h-10",
            )}
          >
            <Upload
              className={cn(
                "text-primary/70 group-hover:text-primary transition-colors",
                variant === "hero" ? "w-6 h-6" : "w-4 h-4",
              )}
            />
          </div>
          <div className="text-center">
            <p
              className={cn(
                "font-medium text-foreground/85 group-hover:text-foreground transition-colors",
                variant === "hero" ? "text-sm" : "text-xs",
              )}
            >
              Drop files here or{" "}
              <span className="text-primary underline">browse</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              PDF, PNG, JPG, WEBP — multiple files supported
            </p>
          </div>
        </button>
      )}

      {/* Phone-scanner on-ramp — camera capture + crop + combine into one PDF */}
      {extractor.selectedFiles.length === 0 && (
        <Link
          href="/tools/scanner"
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ScanLine className="h-3.5 w-3.5" />
          Scan with your camera
        </Link>
      )}

      {/* Per-file progress (shown only during/after a session) */}
      {progressRows.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Extracting
          </div>
          {progressRows.map((t) => (
            <div
              key={t.id}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md border text-[11px]",
                t.status === "error"
                  ? "border-destructive/30 bg-destructive/5"
                  : t.status === "done"
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-border bg-muted/40",
              )}
            >
              {t.status === "extracting" ? (
                <Loader2 className="w-3 h-3 animate-spin shrink-0 text-muted-foreground" />
              ) : t.status === "done" ? (
                <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="w-3 h-3 shrink-0 text-destructive" />
              )}
              <span className="truncate flex-1">{t.filename}</span>
              {t.status === "extracting" && t.progressMessage && (
                <span className="text-[10px] text-muted-foreground/70 shrink-0 truncate max-w-[120px]">
                  {t.progressMessage}
                </span>
              )}
              {t.status === "error" && t.error && (
                <span className="text-[10px] text-destructive/80 shrink-0 truncate max-w-[160px]">
                  {t.error}
                </span>
              )}
              {t.status === "done" && (
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 shrink-0">
                  ready
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
