"use client";

/**
 * useScanSaveFlow — the save/processing engine shared by the mobile and
 * desktop scanner surfaces. One engine, two skins (platform doctrine —
 * the desktop build must not fork the orchestration).
 *
 * Owns everything between "user hit Save" and "landed on the extractor":
 * - the createScanPdf stream, end to end: build → per-page OCR events → ids →
 *   the content-processing pipeline's own events (clean/chunk/embed/NER),
 *   including each page's finished cleaned TEXT as the model writes it
 * - the ProcessingView state machine + live page ledger
 * - the verified-fetch navigation gate (3×2s, loud misses)
 * - the optional parallel context-assignment prompt
 * - background boundary detection for every uploaded photo
 *
 * 🚨 THE FLOATING LAW. There is no poll here any more. The clean step used to
 * be watched through a 2s Supabase poll because the pipeline ran detached; it
 * runs INLINE on the save stream, so the client reads the work as the server
 * does it. The only DB read left is the pre-navigation gate, which verifies a
 * fact rather than watching progress.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";

import { createScanPdf, detectDocument } from "./api";
import type { ScanProcessingEvent } from "./api";
import type {
  ProcessingPageRow,
  ProcessingState,
} from "./components/ProcessingView";
import { fetchRawTextPreview, verifyCleanContentReady } from "./processing";
import type { ScanPdfResult, ScanRotation } from "./types";
import type { UseScanSessionResult } from "./useScanSession";

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
  /**
   * Ids of the saved artifact, set the moment the save stream resolves.
   * Both null before a successful save. Exposed (rather than kept in a ref)
   * because the `matrx-user/scanner` surface emitter declares `file_id` /
   * `processed_document_id` — a declared value with no synchronous source
   * is a defect.
   */
  savedIds: { fileId: string | null; docId: string | null };
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
  const [savedIds, setSavedIds] = useState<{
    fileId: string | null;
    docId: string | null;
  }>({ fileId: null, docId: null });
  const [navigating, setNavigating] = useState(false);
  const [contextPromptOpen, setContextPromptOpen] = useState(false);

  const savePromiseRef = useRef<Promise<ScanPdfResult> | null>(null);
  const contextDoneRef = useRef(true);
  const pendingDocIdRef = useRef<string | null>(null);
  /** The saved doc, readable from stream callbacks without re-rendering. */
  const savedDocIdRef = useRef<string | null>(null);

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
  // If the user navigates away mid-save, the save stream still resolves —
  // without this guard it would router.push the user to the extractor from
  // whatever page they're on.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
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
  const finalizeStartedRef = useRef(false);

  /** Completion gate: verified fetch (3×2s, loud misses) → navigate. */
  const finalize = useCallback(
    (docId: string) => {
      if (finalizeStartedRef.current) return;
      finalizeStartedRef.current = true;
      setProcessing((p) =>
        p ? { ...p, active: "done", finalizing: true } : p,
      );
      void verifyCleanContentReady(docId).then(() => {
        pendingDocIdRef.current = docId;
        maybeNavigate();
      });
    },
    [maybeNavigate],
  );

  /**
   * One content-processing event → the live view. The clean stage's `page`
   * events carry the model's ACTUAL rewrite of that page, which is what the
   * step exists to show; counters and the ledger sit under it as context.
   */
  const applyProcessingEvent = useCallback((event: ScanProcessingEvent) => {
    setProcessing((p) => {
      if (!p) return p;
      const next: ProcessingState = { ...p };

      if (event.stage === "clean") {
        if (p.active !== "done") next.active = "clean";
        if (event.cleanedPage) {
          const page = event.cleanedPage;
          next.cleanedPages = [
            ...p.cleanedPages.filter((row) => row.pageNumber !== page.pageNumber),
            { pageNumber: page.pageNumber, title: page.title, text: page.text },
          ].sort((a, b) => a.pageNumber - b.pageNumber);
          // The ledger learns this page's AI section title/kind at the same
          // moment — one event, both halves.
          next.pages = p.pages.map((row) =>
            row.page === page.pageNumber
              ? { ...row, title: page.title, kind: page.kind, cleaned: true }
              : row,
          );
        }
      } else if (
        event.stage === "chunk" ||
        event.stage === "embed" ||
        event.stage === "ner" ||
        event.stage === "enrich"
      ) {
        if (p.active !== "done") next.active = "entities";
      }

      // The scanner's status block is derived from the stream itself now —
      // the same shape ProcessingView already renders, no DB read.
      const cleanedCount = next.cleanedPages.length;
      const total =
        event.stage === "clean" && event.total > 0
          ? event.total
          : (p.status?.pagesTotal ?? p.pageCount ?? 0);
      next.status = {
        pagesTotal: total,
        pagesCleaned: Math.max(cleanedCount, p.status?.pagesCleaned ?? 0),
        cleanContentReady: cleanedCount > 0,
        runStatus:
          event.phase === "error"
            ? "failed"
            : (p.status?.runStatus ?? "running"),
        entities: event.stats?.entities ?? p.status?.entities ?? null,
        chunks: event.stats?.chunks ?? p.status?.chunks ?? null,
      };
      return next;
    });
  }, []);

  const saveNow = useCallback(() => {
    const uploaded = session.items.filter((i) => i.fileId);
    if (uploaded.length === 0 || processing) return;

    pendingDocIdRef.current = null;
    savedDocIdRef.current = null;
    finalizeStartedRef.current = false;
    contextDoneRef.current = true; // prompt is opt-in from the processing view
    const labelAtSave = session.label.trim() || defaultScanLabel();
    setSavedLabel(labelAtSave);
    setSavedIds({ fileId: null, docId: null });
    setProcessing({
      active: "build",
      buildDetail: `Cropping and combining ${uploaded.length} item${uploaded.length === 1 ? "" : "s"}…`,
      ocrDetail: null,
      pageCount: null,
      rawPreview: null,
      status: null,
      pages: [],
      cleanedPages: [],
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
      // The scan is saved and extracted; the pipeline keeps streaming.
      onScanReady: (result) => {
        savedDocIdRef.current = result.doc_id ?? null;
        session.clearAfterSave();
        setSavedIds({
          fileId: result.file_id ?? null,
          docId: result.doc_id ?? null,
        });
        setProcessing((p) =>
          p ? { ...p, active: "clean", pageCount: result.page_count } : p,
        );
        const docId = result.doc_id as string;
        // Fallback only — the per-page stream normally set this already.
        void fetchRawTextPreview(docId).then((preview) => {
          if (preview)
            setProcessing((p) =>
              p && !p.rawPreview ? { ...p, rawPreview: preview } : p,
            );
        });
      },
      onProcessing: applyProcessingEvent,
      onProcessingSettled: (status) => {
        const docId = savedDocIdRef.current;
        if (!docId) return;
        if (status === "failed") {
          // Never silent: the scan itself is safe, but the AI pass is not done.
          toast.error(
            "The scan was saved, but its AI processing failed on the server.",
          );
        }
        finalize(docId);
      },
    });
    savePromiseRef.current = promise;

    promise
      .then((result) => {
        // The stream ended. `onProcessingSettled` normally finalized already;
        // this is the backstop for a server that ends without one.
        const docId = result.doc_id;
        if (docId) finalize(docId);
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
  }, [session, processing, applyProcessingEvent, finalize]);

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
    savedIds,
    navigating,
    saveNow,
    contextPromptOpen,
    onContextPromptChange,
    openAssignContext,
    awaitFileIds,
  };
}
