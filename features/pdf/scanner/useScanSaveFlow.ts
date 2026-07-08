"use client";

/**
 * useScanSaveFlow — the save/processing engine shared by the mobile and
 * desktop scanner surfaces. One engine, two skins (platform doctrine —
 * the desktop build must not fork the orchestration).
 *
 * Owns everything between "user hit Save" and "landed on the extractor":
 * - the createScanPdf stream (build → per-page OCR events → ids)
 * - the ProcessingView state machine + live page ledger
 * - the 2s docproc poll (clean progress, AI page titles, entities)
 * - the verified-fetch navigation gate (3×2s, loud misses)
 * - the optional parallel context-assignment prompt
 * - background boundary detection for every uploaded photo
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createScanPdf, detectDocument } from "./api";
import type {
  ProcessingPageRow,
  ProcessingState,
} from "./components/ProcessingView";
import {
  fetchPageAnalysis,
  fetchProcessingStatus,
  fetchRawTextPreview,
  verifyCleanContentReady,
} from "./processing";
import type { ScanPdfResult, ScanRotation } from "./types";
import type { UseScanSessionResult } from "./useScanSession";

/** Stop polling for pipeline progress after this long and move on. */
const PROCESSING_POLL_TIMEOUT_MS = 4 * 60 * 1000;
const PROCESSING_POLL_INTERVAL_MS = 2000;

export function defaultScanLabel(): string {
  const now = new Date();
  return `Scan ${now.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} ${now.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export interface UseScanSaveFlowResult {
  /** Non-null while the full-screen processing experience is active. */
  processing: ProcessingState | null;
  /** Label captured at save time (session.label clears on success). */
  savedLabel: string;
  navigating: boolean;
  /** Kick off the save. No-op while a save is already running. */
  saveNow: () => void;
  /** Context-assignment prompt (runs in parallel with processing). */
  contextPromptOpen: boolean;
  onContextPromptChange: (open: boolean) => void;
  openAssignContext: () => void;
  awaitFileIds: () => Promise<string[]>;
}

export function useScanSaveFlow(
  session: UseScanSessionResult,
): UseScanSaveFlowResult {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [processing, setProcessing] = useState<ProcessingState | null>(null);
  const [savedLabel, setSavedLabel] = useState("");
  const [navigating, setNavigating] = useState(false);
  const [contextPromptOpen, setContextPromptOpen] = useState(false);

  const savePromiseRef = useRef<Promise<ScanPdfResult> | null>(null);
  const contextDoneRef = useRef(true);
  const pendingDocIdRef = useRef<string | null>(null);

  // ── Background boundary detection ───────────────────────────────────────
  // The moment a photo's upload lands, run detect so the crop editor opens
  // pre-populated (and Save applies crops the user never had to open). One
  // attempt per item; the crop editor's own detect (with the relaxed
  // Try-again pass) remains the interactive fallback.
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
        })
        .catch(() => {
          // Silent — purely an accelerator; the crop editor retries.
        });
    }
  }, [session.items, session.setQuad]);

  // ── Lifecycle guard ─────────────────────────────────────────────────────
  // If the user navigates away mid-save, the save promise still resolves —
  // without this guard it would start a 4-minute orphan poll and then
  // router.push the user to the extractor from whatever page they're on.
  const pollTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  // ── Navigation ──────────────────────────────────────────────────────────
  const navigateToDoc = useCallback(
    (docId: string) => {
      if (!mountedRef.current) return;
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

  // ── Post-save processing orchestration ──────────────────────────────────
  const pollStartedAtRef = useRef(0);
  const finalizeStartedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

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
      if (!mountedRef.current) return;
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

  const saveNow = useCallback(() => {
    const uploaded = session.items.filter((i) => i.fileId);
    if (uploaded.length === 0 || processing) return;

    pendingDocIdRef.current = null;
    finalizeStartedRef.current = false;
    contextDoneRef.current = true; // prompt is opt-in from the processing view
    const labelAtSave = session.label.trim() || defaultScanLabel();
    setSavedLabel(labelAtSave);
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
        // Enhance modes swap in the non-destructive derivative (same
        // post-EXIF space — quads stay valid).
        media: { file_id: (i.enhancedFileId ?? i.fileId) as string },
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
              p.rawPreview ??
              (page.preview.trim() ? page.preview.slice(0, 220) : null),
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
        setProcessing(null); // back to the review surface, items intact
        setContextPromptOpen(false);
        contextDoneRef.current = true;
      });
  }, [session, processing, startPolling]);

  const onContextPromptChange = useCallback(
    (open: boolean) => {
      setContextPromptOpen(open);
      if (!open) {
        contextDoneRef.current = true;
        maybeNavigate();
      }
    },
    [maybeNavigate],
  );

  const openAssignContext = useCallback(() => {
    contextDoneRef.current = false;
    setContextPromptOpen(true);
  }, []);

  const awaitFileIds = useCallback(async () => {
    const result = await savePromiseRef.current;
    return result?.file_id ? [result.file_id] : [];
  }, []);

  return {
    processing,
    savedLabel,
    navigating,
    saveNow,
    contextPromptOpen,
    onContextPromptChange,
    openAssignContext,
    awaitFileIds,
  };
}
