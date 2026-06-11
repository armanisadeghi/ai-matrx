"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useApiAuth } from "@/hooks/useApiAuth";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { buildPdfSource } from "@/features/pdf/utils/source";
import {
  createInactivityWatchdog,
  withTimeout,
} from "@/features/pdf/utils/inactivity";
import { supabase } from "@/utils/supabase/client";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { parseHttpError } from "@/lib/api/errors";
import {
  streamPdfClean,
  streamPdfFullPipeline,
  type PdfFullPipelineBody,
} from "../service/streamPdf";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Frontend view of a `public.processed_documents` row.
 *
 * Note: this used to be backed by `public.extracted_documents` which the RAG
 * team has now superseded. `processed_documents` is the single source of
 * truth and carries lineage + structured JSON. Field naming on the frontend
 * stays in `camelCase` and aliases the canonical columns:
 *
 *   processed_documents.owner_id      → ownerId
 *   processed_documents.storage_uri   → source           (kept for back-compat)
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
  /** Storage URI (S3 / share link) — populated by the Python ingestion path. */
  source: string | null;
  createdAt: string;
  updatedAt: string;
  charCount: number;
  wordCount: number;

  // ── New columns added by the RAG team (Phase 4A — see plan
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
    // `processed_documents` uses `storage_uri`. Older `extracted_documents`
    // used `source`. Tolerate both so the workspace keeps working during
    // the deprecation window.
    source:
      (raw.storage_uri as string | null) ??
      (raw.source as string | null) ??
      null,
    createdAt: (raw.created_at as string) ?? new Date().toISOString(),
    updatedAt: (raw.updated_at as string) ?? new Date().toISOString(),
    charCount: text.length,
    wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
    ownerId: (raw.owner_id as string | null) ?? null,
    organizationId: (raw.organization_id as string | null) ?? null,
    totalPages: (raw.total_pages as number | null) ?? null,
    mimeType: (raw.mime_type as string | null) ?? null,
    sourceKind: (raw.source_kind as string | null) ?? null,
    sourceId: (raw.source_id as string | null) ?? null,
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
const fetchDocInflight = new Map<string, Promise<PdfDocument | null>>();
const fetchDocCache = new Map<
  string,
  { resolvedAt: number; doc: PdfDocument | null }
>();

function fetchDocCacheKey(docId: string, userId: string | null): string {
  return `${userId ?? "<none>"}:${docId}`;
}

async function fetchProcessedDocument(
  docId: string,
  userId: string | null,
): Promise<PdfDocument | null> {
  if (!userId) return null;
  const key = fetchDocCacheKey(docId, userId);

  const cached = fetchDocCache.get(key);
  if (cached && Date.now() - cached.resolvedAt < FETCH_DOC_CACHE_TTL_MS) {
    return cached.doc;
  }

  const existing = fetchDocInflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const { data, error } = await supabase
        .from("processed_documents")
        .select("*")
        .eq("id", docId)
        // RLS already restricts to the owner, but include the predicate
        // so the planner can use the (owner_id, source_kind, source_id, …)
        // unique index when present.
        .eq("owner_id", userId)
        .single();
      if (error || !data) return null;
      return docFromApi(data as unknown as Record<string, unknown>);
    } catch (err) {
      console.error("Failed to fetch PDF document:", err);
      return null;
    }
  })()
    .then((doc) => {
      fetchDocCache.set(key, { resolvedAt: Date.now(), doc });
      return doc;
    })
    .finally(() => {
      fetchDocInflight.delete(key);
    });

  fetchDocInflight.set(key, promise);
  return promise;
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
    return;
  }
  for (const key of fetchDocCache.keys()) {
    if (key.endsWith(`:${docId}`)) fetchDocCache.delete(key);
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
  const { loadHistory: shouldLoadHistory = true } = options;
  const { getHeaders, waitForAuth } = useApiAuth();
  const backendUrl = useAppSelector(selectResolvedBaseUrl);
  const userId = useAppSelector(selectUserId);

  // Tabs & navigation
  const [tabs, setTabs] = useState<ExtractionTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<ActiveTabId>("new");

  // History (metadata-only list)
  const [history, setHistory] = useState<PdfDocument[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // "New extraction" tab state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [batchStatus, setBatchStatus] = useState<BatchStatus>("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track first completed tab id during batch extraction
  const firstCompletedTabRef = useRef<string | null>(null);

  // ── Auth headers helper (still needed for Python POST endpoints) ───────────

  const getAuthHeaders = useCallback(async () => {
    await waitForAuth();
    const headers = getHeaders() as Record<string, string>;
    const { "Content-Type": _, ...rest } = headers;
    return rest;
  }, [getHeaders, waitForAuth]);

  // ── Load history (metadata only, direct from Supabase) ────────────────────

  const loadHistory = useCallback(async () => {
    if (!userId) return;
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("processed_documents")
        // Metadata-only projection. We deliberately do NOT pull `content`,
        // `clean_content`, or `structured_json` here — those columns can be
        // megabytes per row and were causing the workspace to take 2+ minutes
        // to open. Lineage + size hints come along so the sidebar can
        // surface them without a second round-trip.
        .select(
          "id, name, storage_uri, created_at, updated_at, total_pages, mime_type, source_kind, source_id, parent_processed_id, derivation_kind",
        )
        .eq("owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_PAGE_SIZE);

      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      setHistory(rows.map(docFromApi));
    } catch (err) {
      console.error("Failed to load PDF document history:", err);
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

  const extractFiles = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    setBatchStatus("extracting");
    firstCompletedTabRef.current = null;

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

    try {
      const headers = await getAuthHeaders();
      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append("files", file));

      const response = await fetch(
        `${backendUrl}${ENDPOINTS.pdf.batchExtract}?max_concurrent=3`,
        {
          method: "POST",
          headers,
          body: formData,
        },
      );

      if (!response.ok) {
        // Canonical error parsing — extracts the backend envelope's
        // user_message instead of dumping the raw body into the tab.
        const apiError = await parseHttpError(response);
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
        return;
      }

      // Track which placeholder index we're on (results arrive in completion order)
      let resultIndex = 0;

      const { events } = parseNdjsonStream(response);
      for await (const event of events) {
        if (event.event === "info") {
          if (event.data.code === "pdf_page_progress") {
            // Update progress on the currently extracting tab
            const msg = event.data.user_message ?? "";
            setTabs((prev) =>
              prev.map((tab) => {
                if (
                  placeholderTabs.some((p) => p.id === tab.id) &&
                  tab.status === "extracting"
                ) {
                  return { ...tab, progressMessage: msg };
                }
                return tab;
              }),
            );
          }
        }

        if (event.event === "data") {
          // Batch-extract sends untyped row-per-file results — narrow once.
          const evtData = event.data as Record<string, unknown>;
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
            // Fetch the full document
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Extraction failed";
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
      clearFiles();
      // Refresh history
      loadHistory();

      // Switch to first completed tab
      if (firstCompletedTabRef.current) {
        setActiveTabId(firstCompletedTabRef.current);
      }
    }
  }, [
    selectedFiles,
    backendUrl,
    getAuthHeaders,
    fetchDocument,
    clearFiles,
    loadHistory,
  ]);

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
        setHistory((prev) =>
          prev.map((h) => (h.id === doc.id ? full : h)),
        );
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
  // **Important:** the AI Clean endpoint only writes the AGGREGATE
  // `processed_documents.clean_content` column — it does NOT populate
  // per-page `processed_document_pages.cleaned_text`. That column is owned
  // by the RAG pipeline (`/rag/ingest/stream`) which uses a different
  // cleaning algorithm with a per-page section taxonomy. The UI handles
  // both shapes via the smart-pane rule in `PdfStudioReader`.

  interface CleanContentCallbacks {
    onProgress?: (message: string) => void;
    onTextDelta?: (accumulated: string) => void;
  }

  const cleanContent = useCallback(
    async (docId: string, opts: CleanContentCallbacks = {}) => {
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

      // Inactivity watchdog: aborts only when the stream stops EMITTING
      // (stalled socket / hung server) — a stream that's actively working
      // never trips it. Without this, a mid-stream network death stranded
      // the tab on "cleaning" forever with no recovery short of a reload.
      const watchdog = createInactivityWatchdog(90_000);
      try {
        const headers = await getAuthHeaders();
        const { cleanContent: streamedClean } = await streamPdfClean({
          docId,
          baseUrl: backendUrl,
          headers,
          signal: watchdog.signal,
          callbacks: {
            onProgress: (msg) => {
              watchdog.bump();
              opts.onProgress?.(msg);
              setTabs((prev) =>
                prev.map((tab) =>
                  tab.id === docId ? { ...tab, progressMessage: msg } : tab,
                ),
              );
            },
            onTextDelta: (accumulated) => {
              watchdog.bump();
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
              watchdog.bump();
              // Mirror the final payload into the live preview field so
              // legacy consumers (AiCleanView) see the final blob the same
              // way they saw the deltas.
              opts.onTextDelta?.(text);
              setTabs((prev) =>
                prev.map((tab) =>
                  tab.id === docId
                    ? { ...tab, streamingText: text }
                    : tab,
                ),
              );
            },
            onRecordUpdate: () => watchdog.bump(),
          },
        });

        // Finalize — invalidate the cache then read the authoritative row.
        // Even when the stream returned inline `clean_content`, we still
        // round-trip Supabase so the in-memory tab matches the DB exactly
        // (rules out drift if a parallel writer touched the row).
        // Bounded: a hung Supabase fetch must not strand the tab either.
        invalidateProcessedDocumentCache(docId);
        const fresh = await withTimeout(
          fetchDocument(docId),
          15_000,
          "Refreshing the cleaned document",
        ).catch(() => null);

        setTabs((prev) =>
          prev.map((tab) => {
            if (tab.id !== docId) return tab;
            // Prefer the freshly-fetched document; fall back to splicing
            // the streamed text onto whatever's there if the read failed.
            const document = fresh
              ?? (tab.document && streamedClean
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
            "AI cleanup completed but no clean_content was returned",
          );
        }
      } catch (err) {
        const msg = watchdog.timedOut
          ? "No response from the server for 90s — the cleanup may still finish in the background. Refetch in a moment or retry."
          : err instanceof Error
            ? err.message
            : "AI cleanup failed";
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
      } finally {
        watchdog.dispose();
      }
    },
    [backendUrl, getAuthHeaders, fetchDocument],
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
      setHistory((prev) =>
        prev.map((h) => (h.id === docId ? fresh : h)),
      );
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
      const sourceUrl = tab?.document?.source ?? null;
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
      const watchdog = createInactivityWatchdog(90_000);
      try {
        const headers = await getAuthHeaders();
        // Canonical source wire — media.file_id / media.url / media.file_uri.
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
        const wire = buildPdfSource({ sourceKind, sourceId, sourceUrl });
        if (!wire) {
          throw new Error(
            "This document has no resolvable source — re-upload the PDF before re-processing.",
          );
        }
        body.media = wire.media;

        const { childDocId } = await streamPdfFullPipeline({
          body,
          baseUrl: backendUrl,
          headers,
          signal: watchdog.signal,
          callbacks: {
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
                  t.id === docId
                    ? { ...t, streamingText: accumulated }
                    : t,
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
          ? "No response from the server for 90s — the pipeline may still finish in the background. Refetch in a moment or retry."
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
    [tabs, backendUrl, getAuthHeaders, refreshDocument],
  );

  // ── Copy text ──────────────────────────────────────────────────────────────

  const copyText = useCallback(
    async (tabId?: string) => {
      const targetId = tabId ?? activeTabId;
      if (targetId === "new") return;
      const tab = tabs.find((t) => t.id === targetId);
      const text = tab?.document?.content;
      if (text) {
        await navigator.clipboard.writeText(text);
      }
    },
    [tabs, activeTabId],
  );

  // ── Derived state ──────────────────────────────────────────────────────────

  const activeTab =
    activeTabId === "new"
      ? null
      : tabs.find((t) => t.id === activeTabId) ?? null;

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
    history,
    historyLoading,
    loadHistory,
    openDocument,

    // "New" tab state
    selectedFiles,
    batchStatus,
    fileInputRef,
    addFiles,
    removeFile,
    clearFiles,
    extractFiles,

    // Actions
    cleanContent,
    copyText,
    fetchDocument,
    refreshDocument,
    runFullPipeline,
  };
}
