"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { buildPdfSource } from "@/features/pdf/utils/source";
import {
  createInactivityWatchdog,
  withTimeout,
} from "@/features/pdf/utils/inactivity";
import { supabase } from "@/utils/supabase/client";
import { docprocDb, PROCESSED_DOCUMENTS_COLUMNS } from "@/utils/supabase/docprocDb";
import { parseHttpError } from "@/lib/api/errors";
import { getAccessTokenOrNull, requestRaw } from "@/lib/python-client";
import { invalidateProcessedDocumentPages } from "./useProcessedDocumentPages";
import { markAutoCleanHandled } from "./useAutoCleanOnOpen";
import { savePdfRunRequest } from "../state/runRequests";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
import { consumeBatchExtractNdjsonStream } from "../service/batchExtractDebugStream";
import {
  appendBatchExtractDebugLine,
  finishBatchExtractDebugSession,
  markBatchExtractDebugStreaming,
  startBatchExtractDebugSession,
} from "../state/pdfBatchExtractDebugSlice";
import {
  streamPdfClean,
  streamPdfFullPipeline,
  type PdfFullPipelineBody,
} from "../service/streamPdf";
import {
  CLEAN_FAILED_MESSAGE,
  CLEAN_QUEUED_LABEL,
  NO_RECORD_UPDATE_MESSAGE,
  classifyRecordUpdateStatus,
  pollForCleanContent,
  shouldRefreshOnProcessingProgress,
} from "../service/cleanOutcome";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Frontend view of a `docproc.processed_documents` row.
 *
 * Note: this used to be backed by `public.extracted_documents` which the Knowledge
 * team has now superseded. `processed_documents` is the single source of
 * truth and carries lineage + structured JSON. Field naming on the frontend
 * stays in `camelCase` and aliases the canonical columns:
 *
 *   processed_documents.created_by    → ownerId
 *   processed_documents.derivation_*  → derivationKind / derivationMetadata
 *   processed_documents.parent_*      → parentProcessedId
 *   processed_documents.source_*      → sourceKind / sourceId
 *   processed_documents.structured_json → structuredJson (hydrated only)
 */
export interface PdfDocument {
  id: string;
  name: string;
  /** null until the document detail has been fetched. List rows always carry null. */
  content: string | null;
  cleanContent: string | null;
  createdAt: string;
  updatedAt: string;
  charCount: number;
  wordCount: number;

  // ── New columns added by the Knowledge team (Phase 4A — see plan
  // `please-review-the-requirements-zany-sphinx`). All optional so legacy
  // rows that haven't been re-processed still render. ─────────────────────
  ownerId: string | null;
  organizationId: string | null;
  totalPages: number | null;
  mimeType: string | null;
  /** What was processed — `'cld_file'`, `'note'`, `'external_url'`, `'legacy'`. */
  sourceKind: string | null;
  /** Id within `sourceKind` — e.g. the `cld_files.id` when sourceKind = 'cld_file'. */
  sourceId: string | null;
  /** Set when the doc is archived — hidden by default, one click away. */
  archivedAt: string | null;
  /** Processing-lineage parent. Null on the initial extract. */
  parentProcessedId: string | null;
  /** `'initial_extract' | 're_extract' | 're_clean' | 're_chunk' | 'merge_processings'` */
  derivationKind: string;
  /** Free-form JSON describing the params that produced this row. */
  derivationMetadata: Record<string, unknown> | null;
  /**
   * Persisted PdfPageText[] from System A (raw + blocks + words).
   * `null` for legacy rows that were extracted before per-page persistence
   * landed. The Synced View renders nothing on null — UI prompts a re-extract.
   */
  structuredJson: Record<string, unknown> | null;

  /** True only after a full detail fetch landed. List rows are `false`. */
  isHydrated: boolean;
}

export interface ExtractionTab {
  id: string;
  filename: string;
  /**
   * `loading` — opened from the list, full content is still being fetched.
   * `extracting` — a brand-new file is being processed by the Python pipeline.
   * `cleaning` — AI Clean is running on the doc.
   * `done` — content is on the document.
   * `error` — extraction or detail fetch failed.
   */
  status: "loading" | "extracting" | "done" | "error" | "cleaning";
  error: string | null;
  document: PdfDocument | null;
  progressMessage?: string;
  /**
   * Live-accumulating clean text written by the AI Clean / Pipeline stream
   * while `status === "cleaning"`. Cleared on completion (the truth then
   * lives in `document.cleanContent` after the Supabase refetch). Surfaced
   * to legacy `AiCleanView` so it can render a token-by-token preview
   * without re-implementing the stream consumer.
   */
  streamingText?: string;
}

export type ActiveTabId = "new" | string;

export type BatchStatus = "idle" | "extracting";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a PdfDocument from a `processed_documents` row (Supabase or API).
 *
 * If `content` is missing from the raw object the doc is treated as metadata-
 * only and `isHydrated` stays false. The list query selects metadata only on
 * purpose: extracting full text for hundreds of multi-hundred-page PDFs is
 * what was making the workspace take 2+ minutes to open.
 */
function docFromApi(raw: Record<string, unknown>): PdfDocument {
  const hasContent = "content" in raw;
  const content = hasContent ? ((raw.content as string | null) ?? null) : null;
  const cleanContent = hasContent
    ? ((raw.clean_content as string | null) ?? null)
    : null;
  const text = content ?? "";
  return {
    id: raw.id as string,
    name: (raw.name as string) ?? "Untitled",
    content,
    cleanContent,
    createdAt: (raw.created_at as string) ?? new Date().toISOString(),
    updatedAt: (raw.updated_at as string) ?? new Date().toISOString(),
    charCount: text.length,
    wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
    ownerId: (raw.created_by as string | null) ?? null,
    organizationId: (raw.organization_id as string | null) ?? null,
    totalPages: (raw.total_pages as number | null) ?? null,
    mimeType: (raw.mime_type as string | null) ?? null,
    sourceKind: (raw.source_kind as string | null) ?? null,
    sourceId: (raw.source_id as string | null) ?? null,
    archivedAt: (raw.archived_at as string | null) ?? null,
    parentProcessedId: (raw.parent_processed_id as string | null) ?? null,
    derivationKind: (raw.derivation_kind as string) ?? "initial_extract",
    derivationMetadata:
      (raw.derivation_metadata as Record<string, unknown> | null) ?? null,
    structuredJson: hasContent
      ? ((raw.structured_json as Record<string, unknown> | null) ?? null)
      : null,
    isHydrated: hasContent,
  };
}

// ─── Single-doc fetch dedup + short cache ────────────────────────────────────
//
// The studio's click-handler navigates the route AND kicks off a doc fetch;
// the new route mount then fires the SAME fetch on its initial-doc effect.
// Without dedup the same `processed_documents` row was being read twice per
// click — and the second response landed AFTER the first, so the PDF.js
// `<Document>` was being re-mounted with a new doc reference, triggering a
// second round of byte fetches against `/files/{id}/download`.
//
// Both problems collapse to one module-scoped helper: an in-flight map keyed
// by docId so concurrent callers share a single Promise, and a tiny cache so
// a fresh result is reused for `FETCH_DOC_CACHE_TTL_MS` after it resolves.
// The cache key includes userId so a session switch can't reuse the previous
// user's row.

const FETCH_DOC_CACHE_TTL_MS = 30_000;

/**
 * What ONE read of a processed document found. Four answers, never folded into
 * a bare `null`: a screen that only learned "null" could not tell "the session
 * is not ready yet" or "the request failed" from "this row is not yours", and
 * rendered all three as "You don't have access to this processed document" —
 * to admin@admin.com, on its own document, until a second click (2026-09-25).
 */
export type ProcessedDocumentRead =
  /** The row, readable by this viewer. */
  | { kind: "ok"; doc: PdfDocument }
  /** Zero rows: missing, deleted, or not readable — an access question. */
  | { kind: "absent" }
  /** The read itself failed (network, expired session, bad query). */
  | { kind: "fault"; error: unknown }
  /** No signed-in user is known yet — nothing was asked. Wait, never gate. */
  | { kind: "not-ready" };

const fetchDocInflight = new Map<string, Promise<ProcessedDocumentRead>>();
const fetchDocCache = new Map<string, { resolvedAt: number; doc: PdfDocument }>();

function fetchDocCacheKey(docId: string, userId: string): string {
  return `${userId}:${docId}`;
}

async function queryProcessedDocument(
  docId: string,
): Promise<ProcessedDocumentRead> {
  const { data, error } = await docprocDb(supabase)
    .from("processed_documents")
    // NEVER select("*") here — storage_uri is server-only (column-grant
    // scheme), so `*` fails with 42501. See docprocDb.ts.
    .select(PROCESSED_DOCUMENTS_COLUMNS)
    .is("deleted_at", null)
    .eq("id", docId)
    // No `created_by` predicate: RLS is the authority. Filtering to the owner
    // turned every document shared through an organization into zero rows,
    // which the access gate can only read as "denied".
    .maybeSingle();
  if (error) return { kind: "fault", error };
  if (!data) return { kind: "absent" };
  return { kind: "ok", doc: docFromApi(data as unknown as Record<string, unknown>) };
}

export async function readProcessedDocument(
  docId: string,
  userId: string | null,
): Promise<ProcessedDocumentRead> {
  if (!userId) return { kind: "not-ready" };
  const key = fetchDocCacheKey(docId, userId);

  const cached = fetchDocCache.get(key);
  if (cached && Date.now() - cached.resolvedAt < FETCH_DOC_CACHE_TTL_MS) {
    return { kind: "ok", doc: cached.doc };
  }

  const existing = fetchDocInflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<ProcessedDocumentRead> => {
    try {
      const first = await queryProcessedDocument(docId);
      if (first.kind !== "fault") return first;
      // A failed read is most often a session mid-refresh (an expired JWT on a
      // tab that just woke). getSession() completes the refresh; ask once more
      // before reporting a fault.
      await supabase.auth.getSession();
      return await queryProcessedDocument(docId);
    } catch (error) {
      return { kind: "fault", error };
    }
  })()
    .then((read) => {
      // Only cache a HIT. A miss (row not yet visible right after the server
      // created it, a transient RLS/replication race) must self-heal on the
      // next read instead of being pinned for the full TTL.
      // A read whose in-flight entry was evicted by an invalidation started
      // BEFORE the write it was invalidated for — never cache it.
      if (read.kind === "ok" && fetchDocInflight.get(key) === promise) {
        fetchDocCache.set(key, { resolvedAt: Date.now(), doc: read.doc });
      }
      return read;
    })
    .finally(() => {
      if (fetchDocInflight.get(key) === promise) fetchDocInflight.delete(key);
    });

  fetchDocInflight.set(key, promise);
  return promise;
}

async function fetchProcessedDocument(
  docId: string,
  userId: string | null,
): Promise<PdfDocument | null> {
  const read = await readProcessedDocument(docId, userId);
  if (read.kind === "fault") {
    console.error("Failed to fetch PDF document:", read.error);
  }
  return read.kind === "ok" ? read.doc : null;
}

/**
 * Drop the cached `processed_documents` rows. Call this when something
 * mutates a doc (rename, re-clean, re-extract) so the next read sees the
 * fresh state instead of the stale cache. Pass a `docId` to evict one row,
 * or no args to evict everything.
 */
export function invalidateProcessedDocumentCache(docId?: string): void {
  if (docId == null) {
    fetchDocCache.clear();
    fetchDocInflight.clear();
    return;
  }
  for (const key of fetchDocCache.keys()) {
    if (key.endsWith(`:${docId}`)) fetchDocCache.delete(key);
  }
  // In-flight reads too: one started before this write would otherwise be
  // cached for the full TTL without the new text.
  for (const key of fetchDocInflight.keys()) {
    if (key.endsWith(`:${docId}`)) fetchDocInflight.delete(key);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

// Default page size for the history list. Stays under typical Supabase
// payload limits even when we eventually add per-row metadata like
// page_count and char_count.
const HISTORY_PAGE_SIZE = 50;

export interface UsePdfExtractorOptions {
  /**
   * When `false`, the hook skips its `processed_documents` history fetch
   * on mount. Set this from surfaces that already have a list hook of
   * their own (e.g. `usePdfStudioDocs` in `PdfStudioShell`) to avoid two
   * parallel `processed_documents` reads — the duplicate was wired into
   * every studio mount and produced 2 list fetches per page load.
   *
   * Default `true` for back-compat with the legacy workspace which
   * relies on `extractor.history` + `extractor.historyLoading`.
   */
  loadHistory?: boolean;
}

export function usePdfExtractor(options: UsePdfExtractorOptions = {}) {
  const { copyText: copyTextKit } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const { loadHistory: shouldLoadHistory = true } = options;
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const isAdmin = useAppSelector(selectIsAdmin);

  // Tabs & navigation
  const [tabs, setTabs] = useState<ExtractionTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<ActiveTabId>("new");

  // History (metadata-only list)
  const [history, setHistory] = useState<PdfDocument[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // A failed history read is said in the sidebar — never "Extracted files
  // appear here" (RC-B12 r13).
  const [historyError, setHistoryError] = useState<unknown>(null);

  // "New extraction" tab state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [batchStatus, setBatchStatus] = useState<BatchStatus>("idle");
  // The last upload was refused for want of an active organization; the
  // selected files are kept so it can run again the moment one is chosen.
  const [needsOrganization, setNeedsOrganization] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live post-extraction pipeline status per doc id (clean → chunk → embed →
  // NER events streamed by the server's content-processing orchestrator
  // during batch upload). The studio surfaces the active doc's entry in its
  // live-status strip. Cleared per doc when its `record_update` lands.
  const [processingStatus, setProcessingStatus] = useState<
    Record<string, string>
  >({});

  // Bumped every time a doc's terminal `record_update` arrives and its fresh
  // row has been refetched — the studio watches this to refresh the active
  // doc + page rows without prop-drilling a callback through the upload UIs.
  const [processedDocSignal, setProcessedDocSignal] = useState<{
    docId: string;
    at: number;
  } | null>(null);

  // Track first completed tab id during batch extraction
  const firstCompletedTabRef = useRef<string | null>(null);

  // ── Load history (metadata only, direct from Supabase) ────────────────────

  const loadHistory = useCallback(async () => {
    if (!userId) return;
    setHistoryLoading(true);
    try {
      const { data, error } = await docprocDb(supabase)
        .from("processed_documents")
        // Metadata-only projection. We deliberately do NOT pull `content`,
        // `clean_content`, or `structured_json` here — those columns can be
        // megabytes per row and were causing the workspace to take 2+ minutes
        // to open. Lineage + size hints come along so the sidebar can
        // surface them without a second round-trip.
        .select(
          "id, name, created_at, updated_at, total_pages, mime_type, source_kind, source_id, parent_processed_id, derivation_kind, archived_at",
        )
        .eq("created_by", userId)
        // THE ARCHIVED-ITEMS LAW (../common-docs/policies/archived-items.md):
        // archived docs are HIDDEN BY DEFAULT and one click away, so the read
        // carries them and `history` / `archivedHistory` do the split. The
        // hardcoded `.is("archived_at", null)` that used to live here made an
        // archived doc unreachable from this workspace forever. Trashed
        // (`deleted_at`) docs stay out: deletion is not archiving.
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(HISTORY_PAGE_SIZE);

      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      setHistory(rows.map(docFromApi));
      setHistoryError(null);
    } catch (err) {
      console.error("Failed to load PDF document history:", err);
      setHistoryError(err ?? new Error("The document history read failed"));
    } finally {
      setHistoryLoading(false);
    }
  }, [userId]);

  // Load history on mount (and whenever the auth user changes), unless
  // the caller has opted out via `options.loadHistory = false`. The studio
  // opts out because it pulls the same list through `usePdfStudioDocs` —
  // keeping both on would double-fetch `processed_documents` per page.
  useEffect(() => {
    if (!userId || !shouldLoadHistory) return;
    loadHistory();
  }, [userId, loadHistory, shouldLoadHistory]);

  // ── Fetch a single document (full content, direct from Supabase) ───────────
  //
  // Routed through `fetchProcessedDocument` (module-scoped) so concurrent
  // callers for the same id share one network round-trip and a freshly
  // resolved doc is reused for 30s without a re-fetch. The studio
  // previously called this twice per doc-select — once from the
  // click-handler, once from the `initialDocumentId` effect on the
  // remounted route — producing two identical `processed_documents`
  // round-trips and two PDF.js Document loads.

  const fetchDocument = useCallback(
    (docId: string): Promise<PdfDocument | null> =>
      fetchProcessedDocument(docId, userId),
    [userId],
  );

  /** The full answer for a surface that must say WHY a document did not open. */
  const readDocument = useCallback(
    (docId: string): Promise<ProcessedDocumentRead> =>
      readProcessedDocument(docId, userId),
    [userId],
  );

  // ── File selection (for "New" tab) ─────────────────────────────────────────

  // Mirrors the server's hard input cap — rejecting here saves the user a
  // full upload + opaque 4xx for a file the backend will refuse anyway.
  const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

  const addFiles = useCallback((files: File[]) => {
    const typed = files.filter(
      (f) => f.type === "application/pdf" || f.type.startsWith("image/"),
    );
    const oversize = typed.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (oversize.length > 0) {
      toast.error(
        `${oversize.length === 1 ? `"${oversize[0].name}" is` : `${oversize.length} files are`} over the 200MB limit and ${oversize.length === 1 ? "was" : "were"} skipped.`,
      );
    }
    const valid = typed.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (valid.length === 0) return;
    setSelectedFiles((prev) => [...prev, ...valid]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── Batch extraction ───────────────────────────────────────────────────────

  interface ExtractFilesOptions {
    /**
     * Fired the instant the FIRST file finishes and the server hands back a
     * `doc_id` — BEFORE (and independent of) the `processed_documents` detail
     * fetch. The studio uses this to route straight to the new doc so the
     * reader opens the moment the id exists. Decoupled from the detail fetch
     * on purpose: routing must never hinge on a read that can transiently
     * return null right after the row is created.
     */
    onFirstDocId?: (docId: string) => void;
  }

  const extractFiles = useCallback(
    async (opts: ExtractFilesOptions = {}): Promise<string[]> => {
      if (selectedFiles.length === 0) return [];

      setNeedsOrganization(false);
      let heldForOrganization = false;
      setBatchStatus("extracting");
      firstCompletedTabRef.current = null;
      const completedDocIds: string[] = [];
      let firstDocIdFired = false;

      // Create placeholder tabs for each file
      const placeholderTabs: ExtractionTab[] = selectedFiles.map((file, i) => ({
        id: `pending-${Date.now()}-${i}`,
        filename: file.name,
        status: "extracting" as const,
        error: null,
        document: null,
      }));

      setTabs((prev) => [...prev, ...placeholderTabs]);
      // Switch to first extracting tab
      setActiveTabId(placeholderTabs[0].id);

      let debugSessionId: string | null = null;

      try {
        const formData = new FormData();
        selectedFiles.forEach((file) => formData.append("files", file));

        // Server-relative: the host door prepends the active server.
        const requestPath = `${ENDPOINTS.pdf.batchExtract}?max_concurrent=3`;
        debugSessionId = isAdmin
          ? `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          : null;

        if (debugSessionId) {
          const token = await getAccessTokenOrNull();
          dispatch(
            startBatchExtractDebugSession({
              id: debugSessionId,
              startedAt: new Date().toISOString(),
              request: {
                method: "POST",
                url: requestPath,
                queryParams: { max_concurrent: "3" },
                fileNames: selectedFiles.map((f) => f.name),
                fileSizes: selectedFiles.map((f) => f.size),
                authorizationPreview: token
                  ? `${`Bearer ${token}`.slice(0, 16)}…`
                  : null,
              },
            }),
          );
        }

        // allowHttpError: the non-2xx branch below records the status in the
        // admin debug session and on every placeholder tab.
        const response = await requestRaw(
          requestPath,
          { method: "POST", body: formData },
          { allowHttpError: true },
        );

        if (debugSessionId) {
          dispatch(
            markBatchExtractDebugStreaming({ sessionId: debugSessionId }),
          );
        }

        if (!response.ok) {
          const apiError = await parseHttpError(response);
          if (isOrganizationRequiredError(apiError)) {
            throw apiError;
          }
          if (debugSessionId) {
            dispatch(
              finishBatchExtractDebugSession({
                sessionId: debugSessionId,
                finishedAt: new Date().toISOString(),
                status: "error",
                response: {
                  httpStatus: response.status,
                  statusText: response.statusText,
                  contentType: response.headers.get("content-type"),
                  requestId: response.headers.get("X-Request-ID"),
                },
                error: apiError.userMessage,
              }),
            );
          }
          setTabs((prev) =>
            prev.map((tab) =>
              placeholderTabs.some((p) => p.id === tab.id)
                ? {
                    ...tab,
                    status: "error" as const,
                    error: apiError.userMessage,
                  }
                : tab,
            ),
          );
          setBatchStatus("idle");
          return [];
        }

        // Track which placeholder index we're on (results arrive in completion order)
        let resultIndex = 0;

        // `debugSessionId` is a `let`, so its narrowing is lost inside the closure
        // below — capture it as a const the callback can close over.
        const debugSid = debugSessionId;

        const stream = consumeBatchExtractNdjsonStream(
          response,
          debugSid
            ? {
                onRawLine: (line, index) => {
                  dispatch(
                    appendBatchExtractDebugLine({
                      sessionId: debugSid,
                      line: {
                        index,
                        receivedAt: new Date().toISOString(),
                        raw: line,
                      },
                    }),
                  );
                },
              }
            : {
                onRawLine: () => {},
              },
        );

        // Progress helper — writes a live message onto this session's
        // still-extracting placeholder tabs (per-page extraction events
        // don't carry a filename, so the extracting placeholders are the
        // best anchor; with max_concurrent uploads the message is shared).
        const setExtractingProgress = (msg: string) => {
          setTabs((prev) =>
            prev.map((tab) =>
              placeholderTabs.some((p) => p.id === tab.id) &&
              tab.status === "extracting"
                ? { ...tab, progressMessage: msg }
                : tab,
            ),
          );
        };

        // Per-doc bookkeeping for the terminal `record_update` contract: a
        // doc that never gets one did not finish processing (said, never
        // silent).
        const recordUpdated = new Set<string>();
        const lastCleanRefreshAt = new Map<string, number>();

        const refreshCleanedDoc = async (recordId: string) => {
          invalidateProcessedDocumentCache(recordId);
          invalidateProcessedDocumentPages(recordId);
          const fresh = await fetchDocument(recordId);
          setTabs((prev) =>
            prev.map((tab) =>
              tab.id === recordId
                ? { ...tab, document: fresh ?? tab.document }
                : tab,
            ),
          );
          setProcessedDocSignal({ docId: recordId, at: Date.now() });
        };

        for await (const event of stream) {
          if (event.event === "info") {
            if (event.data.code === "pdf_page_progress") {
              // Update progress on the currently extracting tab
              setExtractingProgress(event.data.user_message ?? "");
            }
          }

          // Terminal per-doc signal: the server finished the WHOLE pipeline
          // (extract + clean + chunk + embed + NER) for one document and the
          // row is now the full truth — do the one refetch here.
          if (
            event.event === "record_update" &&
            event.data.table === "processed_documents"
          ) {
            const recordId = event.data.record_id;
            const outcome = classifyRecordUpdateStatus(
              event.data.status,
              event.data.metadata,
            );
            recordUpdated.add(recordId);
            invalidateProcessedDocumentCache(recordId);
            const fresh = await fetchDocument(recordId);
            if (outcome === "queued" || outcome === "active") {
              // Not terminal: keep the doc's status label visible.
              if (outcome === "queued") {
                setProcessingStatus((prev) => ({
                  ...prev,
                  [recordId]: CLEAN_QUEUED_LABEL,
                }));
              }
              setTabs((prev) =>
                prev.map((tab) =>
                  tab.id === recordId
                    ? {
                        ...tab,
                        document: fresh ?? tab.document,
                        progressMessage:
                          outcome === "queued"
                            ? CLEAN_QUEUED_LABEL
                            : tab.progressMessage,
                      }
                    : tab,
                ),
              );
              setProcessedDocSignal({ docId: recordId, at: Date.now() });
              continue;
            }
            const failed = outcome === "failed";
            setTabs((prev) =>
              prev.map((tab) =>
                tab.id === recordId
                  ? {
                      ...tab,
                      document: fresh ?? tab.document,
                      error: failed ? CLEAN_FAILED_MESSAGE : tab.error,
                      progressMessage: undefined,
                    }
                  : tab,
              ),
            );
            setProcessingStatus((prev) => {
              const next = { ...prev };
              delete next[recordId];
              return next;
            });
            setProcessedDocSignal({ docId: recordId, at: Date.now() });
            continue;
          }

          if (event.event === "data") {
            const evtData = event.data as Record<string, unknown>;

            // Typed live-extraction events (same vocabulary as the
            // /pdf/extract-text stream): page-by-page progress.
            if (evtData.type === "pdf_extract_started") {
              const total = evtData.total_pages as number;
              const fname = evtData.filename as string;
              setExtractingProgress(
                `Reading ${fname} (${total} page${total === 1 ? "" : "s"})…`,
              );
              continue;
            }
            if (evtData.type === "pdf_page_extracted") {
              const page = evtData.page_number as number;
              const total = evtData.total_pages as number;
              const method = evtData.extraction_method as string;
              setExtractingProgress(
                `Extracted page ${page} of ${total}${method === "ocr" ? " (OCR)" : ""}…`,
              );
              continue;
            }

            // Content-processing orchestrator progress (clean → chunk →
            // embed → NER), streamed after the doc row exists. Keyed by the
            // processed_documents id so the studio can show it on the doc
            // the user was just routed to.
            if (evtData.kind === "content.processing.progress") {
              const docId = evtData.processed_document_id as string | null;
              const stage = (evtData.stage as string) ?? "processing";
              const message = (evtData.message as string) ?? "";
              const label = `${stage}: ${message}`;
              if (docId) {
                // Cleaned text is readable as soon as the clean stage writes
                // it — refetch then, not after chunk/embed/NER finish.
                const now = Date.now();
                if (
                  shouldRefreshOnProcessingProgress(
                    evtData,
                    lastCleanRefreshAt.get(docId) ?? 0,
                    now,
                  )
                ) {
                  lastCleanRefreshAt.set(docId, now);
                  void refreshCleanedDoc(docId);
                }
                setProcessingStatus((prev) => ({ ...prev, [docId]: label }));
                setTabs((prev) =>
                  prev.map((tab) =>
                    tab.id === docId ? { ...tab, progressMessage: label } : tab,
                  ),
                );
              } else {
                setExtractingProgress(label);
              }
              continue;
            }

            // Anything else with filename+status is a per-file batch result.
            if (
              typeof evtData.filename !== "string" ||
              typeof evtData.status !== "string"
            ) {
              continue;
            }
            const docId = evtData.doc_id as string | null;
            const filename = evtData.filename as string;
            const status = evtData.status as string;
            const error = evtData.error as string | null;

            // Find the matching placeholder by filename, or use resultIndex
            const placeholderIdx = placeholderTabs.findIndex(
              (p, idx) =>
                idx >= resultIndex &&
                p.filename === filename &&
                p.status === "extracting",
            );
            const targetPlaceholder =
              placeholderIdx >= 0
                ? placeholderTabs[placeholderIdx]
                : placeholderTabs[resultIndex];
            resultIndex++;

            if (!targetPlaceholder) continue;

            if (status === "done" && docId) {
              // Hand the id off IMMEDIATELY — before the detail fetch — so the
              // studio can route to the new doc the moment it exists. The
              // reader loads the row itself; blocking navigation on the fetch
              // below (which can momentarily miss) is what stranded the user
              // on the upload screen after a successful extraction.
              completedDocIds.push(docId);
              // The upload stream owns this doc's clean — never auto-run one.
              markAutoCleanHandled(docId);
              // A refresh mid-processing reconnects to this upload's run.
              savePdfRunRequest(
                docId,
                response.headers.get("X-Request-ID"),
                "upload",
              );
              if (!firstDocIdFired) {
                firstDocIdFired = true;
                opts.onFirstDocId?.(docId);
              }

              // Fetch the full document (hydrates the open tab; the route's own
              // fetch shares this via the in-flight dedup).
              const doc = await fetchDocument(docId);
              const newTabId = docId;

              setTabs((prev) =>
                prev.map((tab) =>
                  tab.id === targetPlaceholder.id
                    ? {
                        ...tab,
                        id: newTabId,
                        filename: doc?.name ?? filename,
                        status: "done" as const,
                        error: null,
                        document: doc,
                        progressMessage: undefined,
                      }
                    : tab,
                ),
              );

              // Update activeTabId if it was pointing to the placeholder
              setActiveTabId((prev) =>
                prev === targetPlaceholder.id ? newTabId : prev,
              );

              if (!firstCompletedTabRef.current) {
                firstCompletedTabRef.current = newTabId;
              }
            } else if (status === "error") {
              setTabs((prev) =>
                prev.map((tab) =>
                  tab.id === targetPlaceholder.id
                    ? {
                        ...tab,
                        status: "error" as const,
                        error: error ?? "Extraction failed",
                        progressMessage: undefined,
                      }
                    : tab,
                ),
              );
            }
          }

          if (event.event === "end") {
            break;
          }
        }

        // The stream is over: any finished doc that never got its terminal
        // `record_update` was not fully processed — say so on its tab.
        const unconfirmed = completedDocIds.filter(
          (id) => !recordUpdated.has(id),
        );
        if (unconfirmed.length > 0) {
          setTabs((prev) =>
            prev.map((tab) =>
              unconfirmed.includes(tab.id) && !tab.error
                ? { ...tab, error: NO_RECORD_UPDATE_MESSAGE }
                : tab,
            ),
          );
        }

        if (debugSessionId) {
          dispatch(
            finishBatchExtractDebugSession({
              sessionId: debugSessionId,
              finishedAt: new Date().toISOString(),
              status: "complete",
              response: {
                httpStatus: response.status,
                statusText: response.statusText,
                contentType: response.headers.get("content-type"),
                requestId: response.headers.get("X-Request-ID"),
              },
              error: null,
            }),
          );
        }
      } catch (err) {
        if (isOrganizationRequiredError(err)) {
          // Not a failure of the files: offer the organization picker and keep
          // them selected; the upload runs again once one is chosen.
          heldForOrganization = true;
          setNeedsOrganization(true);
          setTabs((prev) =>
            prev.filter((tab) => !placeholderTabs.some((p) => p.id === tab.id)),
          );
          setActiveTabId((prev) =>
            placeholderTabs.some((p) => p.id === prev) ? "new" : prev,
          );
          if (debugSessionId) {
            dispatch(
              finishBatchExtractDebugSession({
                sessionId: debugSessionId,
                finishedAt: new Date().toISOString(),
                status: "error",
                response: null,
                error: "organization_required",
              }),
            );
          }
          return [];
        }
        const msg = err instanceof Error ? err.message : "Extraction failed";
        if (debugSessionId) {
          dispatch(
            finishBatchExtractDebugSession({
              sessionId: debugSessionId,
              finishedAt: new Date().toISOString(),
              status: "error",
              response: null,
              error: msg,
            }),
          );
        }
        // Mark remaining extracting placeholders as error
        setTabs((prev) =>
          prev.map((tab) =>
            placeholderTabs.some((p) => p.id === tab.id) &&
            tab.status === "extracting"
              ? { ...tab, status: "error" as const, error: msg }
              : tab,
          ),
        );
      } finally {
        // Stream ended (or threw). Sweep any placeholders still stuck in
        // "extracting" — the server didn't send a per-file result for them.
        // Without this sweep, those tabs spin forever and the user has to
        // close them manually.
        setTabs((prev) =>
          prev.map((tab) =>
            placeholderTabs.some((p) => p.id === tab.id) &&
            tab.status === "extracting"
              ? {
                  ...tab,
                  status: "error" as const,
                  error:
                    "No result received from server before the stream ended. Try this file on its own.",
                  progressMessage: undefined,
                }
              : tab,
          ),
        );

        setBatchStatus("idle");
        // Held for an organization: the files stay selected for the retry.
        if (!heldForOrganization) {
          // The stream is over — no more processing events can arrive, so any
          // leftover per-doc status is stale. Clear it — except docs parked on
          // the batch queue, whose "Cleaning queued" label is still true.
          setProcessingStatus((prev) => {
            const kept: Record<string, string> = {};
            for (const [id, label] of Object.entries(prev)) {
              if (label === CLEAN_QUEUED_LABEL) kept[id] = label;
            }
            return kept;
          });
          clearFiles();
          // Refresh history
          loadHistory();

          // Switch to first completed tab
          if (firstCompletedTabRef.current) {
            setActiveTabId(firstCompletedTabRef.current);
          }
        }
      }

      return completedDocIds;
    },
    [
      selectedFiles,
      fetchDocument,
      clearFiles,
      loadHistory,
      dispatch,
      isAdmin,
    ],
  );

  // ── Open a document from history (sidebar click) ───────────────────────────
  //
  // The history list carries metadata only (no `content`, no `clean_content`).
  // When the user clicks an item we open the tab in `loading` state and
  // hydrate it via a single Supabase detail fetch. A second click on the same
  // item is a no-op because the tab already has the full doc.

  const openDocument = useCallback(
    (doc: PdfDocument) => {
      // If a tab is already open for this doc, just focus it.
      const existing = tabs.find((t) => t.id === doc.id);
      if (existing) {
        setActiveTabId(doc.id);
        return;
      }

      // Already hydrated (came from a fresh extraction or a previous fetch) —
      // open immediately with full content.
      if (doc.isHydrated) {
        const newTab: ExtractionTab = {
          id: doc.id,
          filename: doc.name,
          status: "done",
          error: null,
          document: doc,
        };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(doc.id);
        return;
      }

      // Metadata-only — open in loading state, then fetch detail.
      const placeholderTab: ExtractionTab = {
        id: doc.id,
        filename: doc.name,
        status: "loading",
        error: null,
        document: doc,
        progressMessage: "Loading content…",
      };
      setTabs((prev) => [...prev, placeholderTab]);
      setActiveTabId(doc.id);

      void (async () => {
        const full = await fetchDocument(doc.id);
        if (!full) {
          setTabs((prev) =>
            prev.map((tab) =>
              tab.id === doc.id
                ? {
                    ...tab,
                    status: "error" as const,
                    error: "Could not load document content from the database.",
                    progressMessage: undefined,
                  }
                : tab,
            ),
          );
          return;
        }
        // Patch the tab and the corresponding history entry so a second
        // open is instant.
        setTabs((prev) =>
          prev.map((tab) =>
            tab.id === doc.id
              ? {
                  ...tab,
                  status: "done" as const,
                  filename: full.name,
                  document: full,
                  progressMessage: undefined,
                }
              : tab,
          ),
        );
        setHistory((prev) => prev.map((h) => (h.id === doc.id ? full : h)));
      })();
    },
    [tabs, fetchDocument],
  );

  // ── Close a tab ────────────────────────────────────────────────────────────

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId);
        const filtered = prev.filter((t) => t.id !== tabId);

        // If closing the active tab, switch to adjacent or "new"
        if (activeTabId === tabId) {
          if (filtered.length > 0) {
            const newIdx = Math.min(idx, filtered.length - 1);
            setActiveTabId(filtered[newIdx].id);
          } else {
            setActiveTabId("new");
          }
        }

        return filtered;
      });
    },
    [activeTabId],
  );

  // ── AI Content Cleaning ────────────────────────────────────────────────────
  //
  // Streams `/utilities/pdf/clean-content/{docId}` via the shared
  // `streamPdfClean` service (which itself sits on `consumeStream` from
  // `lib/api/stream-parser` — the platform-wide NDJSON primitive).
  //
  // Finalize sequence on success:
  //   1. Stream emits `data.clean_content` (the agent's whole-doc output) and
  //      `record_update` (the server's "row changed" signal).
  //   2. We invalidate the module-scoped doc cache so the next read goes to
  //      Supabase, not the 30-second stale entry.
  //   3. Refetch the row, replace the tab's document with the fresh truth.
  //
  // **Two server modes (announced via the `pdf_clean_started` data event):**
  //   - `whole_doc` (≤200 pages): one agent request writes only the AGGREGATE
  //     `processed_documents.clean_content` column — per-page
  //     `processed_document_pages.cleaned_text` stays untouched.
  //   - `per_page` (>200 pages): the RESUMABLE per-page model (same engine
  //     as the Knowledge clean stage) — every page's `cleaned_text` + section
  //     taxonomy persists the moment it finishes, then the aggregate is
  //     written from the per-page results. On a dropped connection this
  //     hook auto-retries; the server skips already-cleaned pages.
  // The UI handles both shapes via the smart-pane rule in `PdfStudioReader`.

  interface CleanContentCallbacks {
    onProgress?: (message: string) => void;
    onTextDelta?: (accumulated: string) => void;
  }

  /** `queued` = the server parked the clean on the batch queue; text comes later. */
  interface CleanContentResult {
    status: "done" | "queued";
  }

  const cleanContent = useCallback(
    async (
      docId: string,
      opts: CleanContentCallbacks = {},
    ): Promise<CleanContentResult> => {
      // Set tab to cleaning status; clear any prior error / stale stream text.
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === docId
            ? {
                ...tab,
                status: "cleaning" as const,
                error: null,
                progressMessage: "Starting AI cleanup...",
                streamingText: "",
              }
            : tab,
        ),
      );

      // Whether the server declared this run resumable (`pdf_clean_started`
      // with mode "per_page" — large docs). Per-page runs persist every
      // cleaned page server-side, so a dropped/stalled stream is safely
      // retried: the server skips the pages that already finished.
      let perPageMode = false;
      const MAX_RESUME_RETRIES = 2;

      // One stream attempt with its own inactivity watchdog: aborts only
      // when the stream stops EMITTING (stalled socket / hung server) — a
      // stream that's actively working never trips it. Without this, a
      // mid-stream network death stranded the tab on "cleaning" forever
      // with no recovery short of a reload.
      let recordStatus: string | null = null;
      let confirmedUpdate = false;
      const runStreamOnce = async (): Promise<string | null> => {
        const watchdog = createInactivityWatchdog(90_000, 15 * 60_000);
        try {
          const result = await streamPdfClean({
            docId,
            signal: watchdog.signal,
            callbacks: {
              // EVERY event (heartbeat, record_reserved, …) proves the
              // server is alive — only silence trips the watchdog.
              onActivity: () => watchdog.bump(),
              // A refresh mid-clean reconnects to exactly this run.
              onRequestId: (requestId) =>
                savePdfRunRequest(docId, requestId, "clean"),
              onCleanStarted: (info) => {
                perPageMode = info.mode === "per_page";
              },
              onProgress: (msg) => {
                opts.onProgress?.(msg);
                setTabs((prev) =>
                  prev.map((tab) =>
                    tab.id === docId ? { ...tab, progressMessage: msg } : tab,
                  ),
                );
              },
              onTextDelta: (accumulated) => {
                opts.onTextDelta?.(accumulated);
                setTabs((prev) =>
                  prev.map((tab) =>
                    tab.id === docId
                      ? { ...tab, streamingText: accumulated }
                      : tab,
                  ),
                );
              },
              onCleanContent: (text) => {
                // Mirror the final payload into the live preview field so
                // legacy consumers (AiCleanView) see the final blob the same
                // way they saw the deltas.
                opts.onTextDelta?.(text);
                setTabs((prev) =>
                  prev.map((tab) =>
                    tab.id === docId ? { ...tab, streamingText: text } : tab,
                  ),
                );
              },
              onRecordUpdate: (_id, status) => {
                confirmedUpdate = true;
                recordStatus = status;
                if (classifyRecordUpdateStatus(status) === "queued") {
                  opts.onProgress?.(CLEAN_QUEUED_LABEL);
                  setTabs((prev) =>
                    prev.map((tab) =>
                      tab.id === docId
                        ? { ...tab, progressMessage: CLEAN_QUEUED_LABEL }
                        : tab,
                    ),
                  );
                }
              },
            },
          });
          return result.cleanContent;
        } catch (err) {
          // The watchdog aborts the fetch; the stream parser ends an aborted
          // stream quietly (streamPdfClean then throws), so this is the one
          // place the stall becomes the timeout message the retry logic sees.
          if (watchdog.timedOut) {
            throw new Error(
              watchdog.timeoutReason === "max"
                ? "The cleanup ran past the 15 minute limit — it may still finish in the background. Refetch in a moment or retry."
                : "No response from the server for 90s — the cleanup may still finish in the background. Refetch in a moment or retry.",
            );
          }
          throw err;
        } finally {
          watchdog.dispose();
        }
      };

      try {
        let streamedClean: string | null = null;
        for (let attempt = 0; ; attempt++) {
          try {
            streamedClean = await runStreamOnce();
            break;
          } catch (err) {
            // Resumable per-page runs auto-retry: the server's per-page
            // checkpoints mean a reconnect only pays for unfinished pages.
            if (perPageMode && attempt < MAX_RESUME_RETRIES) {
              const note = `Connection interrupted — resuming per-page clean (attempt ${attempt + 2}/${MAX_RESUME_RETRIES + 1})…`;
              opts.onProgress?.(note);
              setTabs((prev) =>
                prev.map((tab) =>
                  tab.id === docId ? { ...tab, progressMessage: note } : tab,
                ),
              );
              continue;
            }
            throw err;
          }
        }

        // Finalize — invalidate the cache then read the authoritative row.
        // Even when the stream returned inline `clean_content`, we still
        // round-trip Supabase so the in-memory tab matches the DB exactly
        // (rules out drift if a parallel writer touched the row).
        // Bounded: a hung Supabase fetch must not strand the tab either.
        if (classifyRecordUpdateStatus(recordStatus) === "failed") {
          throw new Error(CLEAN_FAILED_MESSAGE);
        }

        invalidateProcessedDocumentCache(docId);
        let fresh = await withTimeout(
          fetchDocument(docId),
          15_000,
          "Refreshing the cleaned document",
        ).catch(() => null);

        const queued =
          classifyRecordUpdateStatus(recordStatus) === "queued" &&
          !streamedClean &&
          !fresh?.cleanContent;

        // The stream ended with no text and no queue notice: the server often
        // finishes the write seconds later — poll the row for a bounded time
        // before calling it an error.
        if (!queued && !streamedClean && !fresh?.cleanContent) {
          const polled = await pollForCleanContent(async () => {
            invalidateProcessedDocumentCache(docId);
            fresh = await fetchDocument(docId);
            return fresh?.cleanContent ?? null;
          });
          if (polled) streamedClean = polled;
        }

        if (queued) {
          markAutoCleanHandled(docId);
          setProcessingStatus((prev) => ({
            ...prev,
            [docId]: CLEAN_QUEUED_LABEL,
          }));
          setTabs((prev) =>
            prev.map((tab) =>
              tab.id === docId
                ? {
                    ...tab,
                    status: "done" as const,
                    progressMessage: CLEAN_QUEUED_LABEL,
                    streamingText: undefined,
                    document: fresh ?? tab.document,
                  }
                : tab,
            ),
          );
          return { status: "queued" };
        }

        setTabs((prev) =>
          prev.map((tab) => {
            if (tab.id !== docId) return tab;
            // Prefer the freshly-fetched document; fall back to splicing
            // the streamed text onto whatever's there if the read failed.
            const document =
              fresh ??
              (tab.document && streamedClean
                ? { ...tab.document, cleanContent: streamedClean }
                : tab.document);
            return {
              ...tab,
              status: "done" as const,
              progressMessage: undefined,
              streamingText: undefined,
              document,
            };
          }),
        );

        if (!streamedClean && !fresh?.cleanContent) {
          // Honest signal — neither path produced content. Surface it so
          // the caller can decide (toast / retry) instead of pretending
          // the run worked.
          throw new Error(
            confirmedUpdate
              ? "AI cleanup completed but no clean_content was returned"
              : NO_RECORD_UPDATE_MESSAGE,
          );
        }
        setProcessingStatus((prev) => {
          if (!(docId in prev)) return prev;
          const next = { ...prev };
          delete next[docId];
          return next;
        });
        return { status: "done" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI cleanup failed";
        setTabs((prev) =>
          prev.map((tab) =>
            tab.id === docId
              ? {
                  ...tab,
                  status: "done" as const,
                  error: msg,
                  progressMessage: undefined,
                  streamingText: undefined,
                }
              : tab,
          ),
        );
        throw err instanceof Error ? new Error(msg) : err;
      }
    },
    [fetchDocument],
  );

  // ── Refresh a single document from Supabase (explicit user action) ────────
  //
  // Used by the AI Clean panel's "Refetch from server" button. Pulls the
  // current row state (which may have `clean_content` populated by a
  // previously successful stream that we missed) and updates both the open
  // tab and the cached history entry. Surfaces an explicit error if it fails.

  const refreshDocument = useCallback(
    async (docId: string): Promise<boolean> => {
      // Bust the 30s TTL cache so the read sees writes that landed after
      // the last fetch. Without this, a refresh inside the cache window
      // returned the pre-mutation row and the user saw their action "not
      // working" until they navigated away and back.
      invalidateProcessedDocumentCache(docId);
      const fresh = await fetchDocument(docId);
      if (!fresh) {
        setTabs((prev) =>
          prev.map((tab) =>
            tab.id === docId
              ? {
                  ...tab,
                  error: "Could not refetch this document from Supabase",
                  progressMessage: undefined,
                }
              : tab,
          ),
        );
        return false;
      }
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === docId
            ? {
                ...tab,
                status: "done" as const,
                error: null,
                document: fresh,
                progressMessage: undefined,
              }
            : tab,
        ),
      );
      setHistory((prev) => prev.map((h) => (h.id === docId ? fresh : h)));
      return true;
    },
    [fetchDocument],
  );

  // ── Run the full pipeline (re-extract + chunk + AI) on an existing doc ────
  //
  // Calls Python `/utilities/pdf/full-pipeline` which reads the source PDF
  // (looked up via `MediaRef`), runs extract → cleanup → chunk → optional AI,
  // and writes the result as a NEW child `processed_documents` row with
  // `parent_processed_id` pointing back here, plus N
  // `processed_document_pages` rows on the child. The new child id arrives
  // on `result.file_id` in the stream's `data` event — we capture it and
  // return it to the caller so the route can silently re-route to the new
  // doc instead of staring at the stale parent.

  interface RunFullPipelineOptions {
    force_ocr?: boolean;
    onProgress?: (message: string) => void;
    onTextDelta?: (accumulated: string) => void;
  }

  interface RunFullPipelineResult {
    success: boolean;
    /** New child `processed_documents.id`, when persistence ran server-side. */
    childDocId: string | null;
  }

  const runFullPipeline = useCallback(
    async (
      docId: string,
      options?: RunFullPipelineOptions,
    ): Promise<RunFullPipelineResult> => {
      const tab = tabs.find((t) => t.id === docId);
      const sourceKind = tab?.document?.sourceKind ?? null;
      const sourceId = tab?.document?.sourceId ?? null;

      // Mark the tab as cleaning (reuses the existing spinner) and clear
      // any prior error or stale stream preview.
      setTabs((prev) =>
        prev.map((t) =>
          t.id === docId
            ? {
                ...t,
                status: "cleaning" as const,
                error: null,
                progressMessage: "Starting full pipeline…",
                streamingText: "",
              }
            : t,
        ),
      );

      // Same stall protection as cleanContent — see createInactivityWatchdog.
      const watchdog = createInactivityWatchdog(90_000, 30 * 60_000);
      try {
        // Canonical source wire — media.file_id / media.url.
        // The server's PdfRequest reads `options.force_ocr` (NOT top-level)
        // and has no `persist_output` field (it always persists for signed-in
        // users); both used to be sent at the top level and were silently
        // dropped by Pydantic.
        const body: PdfFullPipelineBody = {
          options: {
            include_page_metadata: true,
            include_block_metadata: true,
            include_word_metadata: true,
            include_chunk_metadata: true,
            force_ocr: options?.force_ocr ?? false,
          },
        };
        const wire = buildPdfSource({ sourceKind, sourceId });
        if (!wire) {
          throw new Error(
            "This document has no resolvable source — re-upload the PDF before re-processing.",
          );
        }
        body.media = wire.media;

        const { childDocId } = await streamPdfFullPipeline({
          body,
          signal: watchdog.signal,
          callbacks: {
            onActivity: () => watchdog.bump(),
            onProgress: (msg) => {
              watchdog.bump();
              options?.onProgress?.(msg);
              setTabs((prev) =>
                prev.map((t) =>
                  t.id === docId ? { ...t, progressMessage: msg } : t,
                ),
              );
            },
            onTextDelta: (accumulated) => {
              watchdog.bump();
              options?.onTextDelta?.(accumulated);
              setTabs((prev) =>
                prev.map((t) =>
                  t.id === docId ? { ...t, streamingText: accumulated } : t,
                ),
              );
            },
            onChildDocId: () => watchdog.bump(),
            onRecordUpdate: () => watchdog.bump(),
          },
        });

        // Finalize on whichever row the server actually wrote to. If a
        // child was created, refresh THAT — otherwise refresh the parent
        // we started from. Cache invalidation lives inside
        // `refreshDocument` (one place, one rule). Bounded so a hung
        // Supabase round-trip can't strand the tab on "cleaning".
        const finalizeId = childDocId ?? docId;
        await withTimeout(
          refreshDocument(finalizeId),
          15_000,
          "Refreshing the processed document",
        );

        // Reset the source tab's spinner. If we routed to a child, the
        // route will mount a new tab; the parent tab just needs to look
        // calm again. Previously this stayed `"cleaning"` forever — bug
        // surfaced while reading; fixed in the same change.
        setTabs((prev) =>
          prev.map((t) =>
            t.id === docId
              ? {
                  ...t,
                  status: "done" as const,
                  progressMessage: undefined,
                  streamingText: undefined,
                }
              : t,
          ),
        );

        return { success: true, childDocId };
      } catch (err) {
        const msg = watchdog.timedOut
          ? watchdog.timeoutReason === "max"
            ? "The pipeline ran past the 30 minute limit — it may still finish in the background. Refetch in a moment or retry."
            : "No response from the server for 90s — the pipeline may still finish in the background. Refetch in a moment or retry."
          : err instanceof Error
            ? err.message
            : "Pipeline run failed";
        setTabs((prev) =>
          prev.map((t) =>
            t.id === docId
              ? {
                  ...t,
                  status: "done" as const,
                  error: msg,
                  progressMessage: undefined,
                  streamingText: undefined,
                }
              : t,
          ),
        );
        return { success: false, childDocId: null };
      } finally {
        watchdog.dispose();
      }
    },
    [tabs, refreshDocument],
  );

  // ── Copy text ──────────────────────────────────────────────────────────────

  const copyText = useCallback(
    async (tabId?: string) => {
      const targetId = tabId ?? activeTabId;
      if (targetId === "new") return;
      const tab = tabs.find((t) => t.id === targetId);
      const text = tab?.document?.content;
      if (text) {
        await copyTextKit(text);
      }
    },
    [tabs, activeTabId],
  );

  // ── Derived state ──────────────────────────────────────────────────────────

  const activeTab =
    activeTabId === "new"
      ? null
      : (tabs.find((t) => t.id === activeTabId) ?? null);

  const openTabIds = new Set(tabs.map((t) => t.id));

  return {
    // Tab management
    tabs,
    activeTabId,
    activeTab,
    setActiveTabId,
    closeTab,
    openTabIds,

    // History
    history: history.filter((doc) => !doc.archivedAt),
    archivedHistory: history.filter((doc) => Boolean(doc.archivedAt)),
    historyLoading,
    historyError,
    loadHistory,
    openDocument,

    // "New" tab state
    selectedFiles,
    batchStatus,
    needsOrganization,
    fileInputRef,
    addFiles,
    removeFile,
    clearFiles,
    extractFiles,

    // Live post-extraction pipeline status (batch upload)
    processingStatus,
    processedDocSignal,

    // Actions
    cleanContent,
    copyText,
    fetchDocument,
    readDocument,
    /** A signed-in user is known, so a document read can be asked at all. */
    authReady: userId != null,
    refreshDocument,
    runFullPipeline,
  };
}
