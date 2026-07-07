"use client";

/**
 * ScannerSurface — the phone-scanner surface of the PDF domain.
 *
 * Flow: add items (camera / library / files — every add uploads
 * IMMEDIATELY via useScanSession) → review grid (reorder / crop /
 * remove) → save: ONE streaming round trip builds the PDF server-side
 * (crops applied there), extracts it, and hands back `doc_id`; the
 * context-assignment prompt (canonical UploadContextPrompt) runs in
 * parallel with the build; we land on `/tools/pdf-extractor/{doc_id}`.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  Camera as CameraIcon,
  FilePlus2,
  History,
  ImagePlus,
  Loader2,
  ScanLine,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderBack from "@/features/shell/components/header/variants/shared/HeaderBack";
import { UploadContextPrompt } from "@/features/scopes/components/context-assignment/UploadContextPrompt";

import { createScanPdf, detectDocument } from "../api";
import {
  fetchPageAnalysis,
  fetchProcessingStatus,
  fetchRawTextPreview,
  verifyCleanContentReady,
} from "../processing";
import type { Quad, ScanItem, ScanPdfResult, ScanRotation } from "../types";
import { useScanSession } from "../useScanSession";
import { CaptureView } from "./CaptureView";
import { CropSheet } from "./CropSheet";
import {
  ProcessingView,
  type ProcessingPageRow,
  type ProcessingState,
} from "./ProcessingView";
import { ReviewList } from "./ReviewList";
import { SaveSheet } from "./SaveSheet";

/** Stop polling for pipeline progress after this long and move on. */
const PROCESSING_POLL_TIMEOUT_MS = 4 * 60 * 1000;
const PROCESSING_POLL_INTERVAL_MS = 2000;

function defaultLabel(): string {
  const now = new Date();
  return `Scan ${now.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} ${now.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export default function ScannerSurface() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const session = useScanSession();

  const [capturing, setCapturing] = useState(false);
  const [cropItem, setCropItem] = useState<ScanItem | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [processing, setProcessing] = useState<ProcessingState | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [navigating, setNavigating] = useState(false);

  // Context prompt runs in parallel with the save stream.
  const [contextPromptOpen, setContextPromptOpen] = useState(false);
  // Captured at save start — session.label is cleared on success while the
  // prompt is still open, so the prompt must not read the live label.
  const [savedLabel, setSavedLabel] = useState("");
  const savePromiseRef = useRef<Promise<ScanPdfResult> | null>(null);
  const contextDoneRef = useRef(true);
  const pendingDocIdRef = useRef<string | null>(null);

  const libraryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageShots = session.items
    .filter((i) => i.kind === "image" && i.previewUrl)
    .map((i) => ({ itemId: i.itemId, previewUrl: i.previewUrl as string }));

  // Background boundary detection: the moment a photo's upload lands, run
  // detect so the crop sheet opens pre-populated (and Save can apply crops
  // the user never had to open). One attempt per item; the crop sheet's
  // own detect (with Try-again) remains the interactive fallback.
  const detectAttemptedRef = useRef(new Set<string>());
  useEffect(() => {
    for (const item of session.items) {
      if (item.kind !== "image" || item.status !== "uploaded" || !item.fileId)
        continue;
      if (item.quad !== undefined) continue; // user already decided
      if (detectAttemptedRef.current.has(item.itemId)) continue;
      detectAttemptedRef.current.add(item.itemId);
      const { itemId, fileId } = item;
      detectDocument(fileId)
        .then((res) => {
          if (res.found && res.quad) session.setQuad(itemId, res.quad);
          // Not found: leave undefined so the crop sheet still auto-tries
          // (including the relaxed pass) when opened.
        })
        .catch(() => {
          // Silent — purely an accelerator; the crop sheet retries.
        });
    }
  }, [session.items, session.setQuad]);  

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) session.addFiles(files);
      e.target.value = "";
    },
    [session],
  );

  const handleCropApply = useCallback(
    (itemId: string, quad: Quad | null, rotation: ScanRotation) => {
      session.setQuad(itemId, quad);
      session.setRotation(itemId, rotation);
    },
    [session],
  );

  const navigateToDoc = useCallback(
    (docId: string) => {
      setNavigating(true);
      startTransition(() => {
        router.push(`/tools/pdf-extractor/${docId}`);
      });
    },
    [router],
  );

  /** Navigate once BOTH the doc exists and the context prompt is done. */
  const maybeNavigate = useCallback(() => {
    if (pendingDocIdRef.current && contextDoneRef.current) {
      navigateToDoc(pendingDocIdRef.current);
    }
  }, [navigateToDoc]);

  const openSave = useCallback(() => {
    if (!session.label.trim()) session.setLabel(defaultLabel());
    setSaveOpen(true);
  }, [session]);

  // ── Post-save processing orchestration ─────────────────────────────────
  const pollTimerRef = useRef<number | null>(null);
  const pollStartedAtRef = useRef(0);
  const finalizeStartedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  /** Completion gate: verified fetch (3×2s, loud misses) → navigate. */
  const finalize = useCallback(
    (docId: string) => {
      if (finalizeStartedRef.current) return;
      finalizeStartedRef.current = true;
      stopPolling();
      setProcessing((p) => (p ? { ...p, active: "done", finalizing: true } : p));
      void verifyCleanContentReady(docId).then(() => {
        pendingDocIdRef.current = docId;
        maybeNavigate();
      });
    },
    [stopPolling, maybeNavigate],
  );

  const startPolling = useCallback(
    (docId: string) => {
      stopPolling();
      pollStartedAtRef.current = Date.now();
      pollTimerRef.current = window.setInterval(() => {
        void Promise.all([
          fetchProcessingStatus(docId),
          fetchPageAnalysis(docId).catch(() => null),
        ])
          .then(([status, analysis]) => {
            setProcessing((p) => {
              if (!p) return p;
              const allCleaned =
                status.pagesTotal > 0 &&
                status.pagesCleaned >= status.pagesTotal;
              const active =
                status.runStatus === "completed"
                  ? "done"
                  : allCleaned
                    ? "entities"
                    : "clean";
              // Enrich the live ledger with the AI's per-page analysis
              // (section titles/kinds land page-by-page as the clean
              // pipeline works through the document).
              let pages = p.pages;
              if (analysis && analysis.length > 0) {
                const byPage = new Map(pages.map((row) => [row.page, row]));
                pages = analysis.map((a): ProcessingPageRow => {
                  const existing = byPage.get(a.pageNumber);
                  return {
                    page: a.pageNumber,
                    chars: existing?.chars ?? a.rawChars,
                    method: existing?.method ?? (a.usedOcr ? "ocr" : "native"),
                    preview: existing?.preview,
                    title: a.title,
                    kind: a.kind,
                    cleaned: a.cleaned,
                  };
                });
              }
              return {
                ...p,
                status,
                pages,
                active: p.active === "done" ? "done" : active,
              };
            });
            if (status.runStatus === "completed") finalize(docId);
          })
          .catch(() => {
            // Transient read failure — next tick retries.
          });
        if (Date.now() - pollStartedAtRef.current > PROCESSING_POLL_TIMEOUT_MS) {
          console.error(
            `[scanner] processing poll timed out for doc ${docId} — navigating anyway`,
          );
          finalize(docId);
        }
      }, PROCESSING_POLL_INTERVAL_MS);
    },
    [stopPolling, finalize],
  );

  const handleSave = useCallback(() => {
    const uploaded = session.items.filter((i) => i.fileId);
    if (uploaded.length === 0 || processing) return;

    pendingDocIdRef.current = null;
    finalizeStartedRef.current = false;
    contextDoneRef.current = true; // prompt is opt-in from the processing view
    const labelAtSave = session.label.trim() || defaultLabel();
    setSavedLabel(labelAtSave);
    setSaveOpen(false);
    setProcessing({
      active: "build",
      buildDetail: `Cropping and combining ${uploaded.length} item${uploaded.length === 1 ? "" : "s"}…`,
      ocrDetail: null,
      pageCount: null,
      rawPreview: null,
      status: null,
      pages: [],
      finalizing: false,
    });

    const payload = {
      items: uploaded.map((i) => ({
        media: { file_id: i.fileId as string },
        kind: i.kind,
        quad: i.kind === "image" ? (i.quad ?? null) : undefined,
        rotation: (i.kind === "image" ? i.rotation : 0) as ScanRotation,
      })),
      filename: labelAtSave,
      folder_path: "Scans",
    };

    const promise = createScanPdf(payload, {
      onProgress: (message) => {
        setProcessing((p) => {
          if (!p) return p;
          // The stream's two phases: assemble → extract.
          if (/extract/i.test(message)) {
            return { ...p, active: "ocr", ocrDetail: message };
          }
          return { ...p, buildDetail: message };
        });
      },
      onExtractStarted: (totalPages) => {
        setProcessing((p) =>
          p
            ? {
                ...p,
                active: "ocr",
                pageCount: totalPages || p.pageCount,
                ocrDetail: totalPages
                  ? `Reading ${totalPages} page${totalPages === 1 ? "" : "s"}…`
                  : p.ocrDetail,
              }
            : p,
        );
      },
      onPageExtracted: (page) => {
        setProcessing((p) => {
          if (!p) return p;
          const row: ProcessingPageRow = {
            page: page.pageNumber,
            chars: page.charCount,
            method: page.extractionMethod,
            preview: page.preview,
            title: null,
            kind: null,
            cleaned: false,
          };
          const pages = [
            ...p.pages.filter((r) => r.page !== page.pageNumber),
            row,
          ].sort((a, b) => a.page - b.page);
          return {
            ...p,
            active: "ocr",
            pages,
            ocrDetail: `Read page ${page.pageNumber} of ${page.totalPages || "?"}`,
            rawPreview:
              p.rawPreview ?? (page.preview.trim() ? page.preview.slice(0, 220) : null),
          };
        });
      },
    });
    savePromiseRef.current = promise;

    promise
      .then((result) => {
        session.clearAfterSave();
        setProcessing((p) =>
          p
            ? {
                ...p,
                active: "clean",
                pageCount: result.page_count,
              }
            : p,
        );
        const docId = result.doc_id as string;
        // Fallback only — the per-page stream normally set this already.
        void fetchRawTextPreview(docId).then((preview) => {
          if (preview)
            setProcessing((p) =>
              p && !p.rawPreview ? { ...p, rawPreview: preview } : p,
            );
        });
        startPolling(docId);
      })
      .catch((err: unknown) => {
        const fileId = (err as { fileId?: string | null })?.fileId;
        const message = err instanceof Error ? err.message : "Scan failed";
        // Assembly may have succeeded even when extraction failed — the
        // PDF is safe in Scans/; say so instead of implying loss.
        toast.error(
          fileId
            ? `${message} — the PDF was still saved to your Scans folder.`
            : message,
        );
        setProcessing(null); // back to the review grid, items intact
        setContextPromptOpen(false);
        contextDoneRef.current = true;
      });
  }, [session, processing, startPolling]);

  const handleContextPromptChange = useCallback(
    (open: boolean) => {
      setContextPromptOpen(open);
      if (!open) {
        contextDoneRef.current = true;
        maybeNavigate();
      }
    },
    [maybeNavigate],
  );

  const awaitFileIds = useCallback(async () => {
    const result = await savePromiseRef.current;
    return result?.file_id ? [result.file_id] : [];
  }, []);

  const empty = session.items.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Route chrome — portals into the shell header row */}
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2 pr-12">
          <HeaderBack onClick={() => router.back()} />
          <ScanLine className="h-4 w-4 shrink-0 text-primary" />
          <h1 className="truncate text-sm font-semibold">Scan to PDF</h1>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {session.uploadingCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                saving {session.uploadingCount}
              </span>
            )}
            {!empty && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => setConfirmDiscard(true)}
                aria-label="Discard scan"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </PageHeader>

      {/* Resume banner */}
      {session.resumable && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <History className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Unsaved scan with {session.resumable.items.length} item
            {session.resumable.items.length === 1 ? "" : "s"}
            {session.resumable.label ? ` — “${session.resumable.label}”` : ""}
          </p>
          <Button size="sm" className="h-8" onClick={session.resume}>
            Resume
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={session.dismissResume}
          >
            Later
          </Button>
        </div>
      )}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <ScanLine className="h-8 w-8 text-primary/70" />
            </div>
            <div>
              <p className="text-sm font-medium">Use your phone as a scanner</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Take photos, add existing images or PDFs, crop, reorder — then
                save everything as one searchable PDF.
              </p>
            </div>
          </div>
        ) : (
          <ReviewList
            items={session.items}
            onMove={session.moveItem}
            onCrop={setCropItem}
            onRemove={session.removeItem}
            onRetry={session.retryItem}
          />
        )}
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 border-t border-border px-3 pb-safe pt-2">
        {session.errorCount > 0 && (
          <p className="pb-1 text-center text-[11px] text-destructive">
            {session.errorCount} upload{session.errorCount === 1 ? "" : "s"}{" "}
            failed — tap a failed tile to retry, or remove it.
          </p>
        )}
        <div className="flex items-center gap-2 pb-2">
          <Button
            variant="outline"
            className="h-11 flex-1"
            onClick={() => setCapturing(true)}
          >
            <CameraIcon className="mr-1.5 h-4 w-4" />
            Camera
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1"
            onClick={() => libraryInputRef.current?.click()}
          >
            <ImagePlus className="mr-1.5 h-4 w-4" />
            Photos
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1"
            onClick={() => fileInputRef.current?.click()}
          >
            <FilePlus2 className="mr-1.5 h-4 w-4" />
            Files
          </Button>
        </div>
        <Button
          className="mb-2 h-11 w-full"
          disabled={!session.allUploaded || Boolean(processing) || navigating}
          onClick={openSave}
        >
          {navigating ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Opening extractor…
            </>
          ) : session.uploadingCount > 0 ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Waiting for uploads…
            </>
          ) : (
            <>
              Save {session.items.length > 0 ? `(${session.items.length})` : ""}
            </>
          )}
        </Button>
      </div>

      {/* Hidden pickers */}
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        onChange={handleInputChange}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.heic,.heif,.pdf"
        multiple
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Overlays */}
      {capturing && (
        <CaptureView
          onCapture={session.addCapture}
          shots={imageShots}
          onRemoveShot={session.removeItem}
          uploadingCount={session.uploadingCount}
          onDone={() => setCapturing(false)}
        />
      )}

      <CropSheet
        item={cropItem}
        onClose={() => setCropItem(null)}
        onApply={handleCropApply}
      />

      <SaveSheet
        open={saveOpen}
        onOpenChange={setSaveOpen}
        label={session.label}
        onLabelChange={session.setLabel}
        itemCount={session.items.length}
        onSave={handleSave}
      />

      {processing && (
        <ProcessingView
          label={savedLabel || "Scanned document"}
          state={processing}
          onAssignContext={() => {
            contextDoneRef.current = false;
            setContextPromptOpen(true);
          }}
        />
      )}

      <UploadContextPrompt
        open={contextPromptOpen}
        onOpenChange={handleContextPromptChange}
        fileNames={[savedLabel || "Scanned document"]}
        awaitFileIds={awaitFileIds}
      />

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this scan?"
        description="All photos and files added to this scan session will be deleted."
        confirmLabel="Discard"
        variant="destructive"
        onConfirm={async () => {
          await session.discard();
          setConfirmDiscard(false);
        }}
      />
    </div>
  );
}
