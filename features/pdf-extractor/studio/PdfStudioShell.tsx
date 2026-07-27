"use client";

/**
 * PdfStudioShell — desktop layout root.
 *
 *   ┌──────┬──────────────────────────────────────────────┬──────────────┐
 *   │      │ Toolbar (sticky)                             │              │
 *   │ Side ├──────────────┬──────────────┬────────────────┤  Inspector   │
 *   │ bar  │ Source PDF   │ Raw text     │ AI-cleaned     │              │
 *   │      │              │              │                │              │
 *   │      │              │ synced       │ synced         │              │
 *   └──────┴──────────────┴──────────────┴────────────────┴──────────────┘
 *
 * Sidebar flips between Files and Pages views (auto-flip on doc select).
 * Reader supports an optional Chunks pane synced bidirectionally with
 * the active page. Per-file pane visibility + sidebar view persist in
 * localStorage via `pdfStudioPersistenceMiddleware`.
 *
 * Reader sync (active page, pending scroll, visible panes) lives in the
 * `pdfStudio` Redux slice so new panes/columns share the same contract.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { useDocumentSearch } from "@/features/rag/hooks/useDocumentSearch";
import { Input } from "@/components/ui/input";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { usePdfExtractor, type PdfDocument } from "../hooks/usePdfExtractor";
import { useProcessedDocumentPages } from "../hooks/useProcessedDocumentPages";
import {
  usePdfStudioDocs,
  type StudioDocSummary,
} from "./hooks/usePdfStudioDocs";
import { useSyncStudioDocNames } from "./hooks/useSyncStudioDocNames";
import { useStudioDocRename } from "./hooks/useStudioDocRename";
import { PdfStudioSidebar } from "./PdfStudioSidebar";
import { PdfStudioHeaderControls } from "./PdfStudioHeaderControls";
import { PdfStudioReader, type PdfPaneEditMode } from "./PdfStudioReader";
import { PdfStudioInspector, type SectionKey } from "./PdfStudioInspector";
import { useFile } from "@/features/files/handler/hooks/useFile";
import { PdfStudioUpload } from "./PdfStudioUpload";
import { PdfStudioUploadDrawer } from "./PdfStudioUploadDrawer";
import { PdfBatchExtractDebugTrigger } from "../components/PdfBatchExtractDebugTrigger";
import { CopyPagesOverlay } from "../components/CopyPagesOverlay";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { KnowledgeAssetPanel } from "@/features/rag/components/library/KnowledgeAssetPanel";
import { useShortcutTrigger } from "@/features/agents/hooks/useShortcutTrigger";
import { useToastManager } from "@/hooks/useToastManager";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { PaneKey } from "../state/types";
import {
  clearActiveDoc,
  clearPendingScroll,
  ensurePaneVisible,
  setActiveDocId,
  setActivePage,
  setPendingScrollPage,
  setScrollSource,
  setSidebarView,
  togglePane as togglePaneAction,
} from "../state/pdfStudioSlice";
import {
  selectActivePage,
  selectPendingScrollPage,
  selectSidebarView,
  selectVisiblePanesForActiveDoc,
} from "../state/selectors";
import { selectRunProgress } from "@/features/page-extraction/redux/selectors";
import { selectViewedJobForFile } from "@/features/page-extraction/redux/selectors";
import { isAllJobsView } from "@/features/page-extraction/redux/pageExtractionSlice";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { buildPdfExtractorScope } from "@/features/pdf-extractor/lib/pdf-extractor-scope";

interface PdfStudioShellProps {
  initialDocumentId?: string;
}

const PANE_ORDER: PaneKey[] = ["pdf", "raw", "clean", "chunks", "extractions"];

/**
 * Convert a metadata-only sidebar summary into a provisional PdfDocument so
 * the reader can mount immediately (with the PDF viewer already working)
 * while the full content fetch runs in the background.
 */
function summaryToProvisionalDoc(s: StudioDocSummary): PdfDocument {
  return {
    id: s.id,
    name: s.name,
    content: null,
    cleanContent: null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    charCount: 0,
    wordCount: 0,
    ownerId: null,
    organizationId: null,
    totalPages: s.totalPages,
    mimeType: s.mimeType,
    sourceKind: s.sourceKind,
    sourceId: s.sourceId,
    parentProcessedId: s.parentProcessedId,
    derivationKind: s.derivationKind,
    derivationMetadata: null,
    structuredJson: null,
    isHydrated: false,
  };
}

export function PdfStudioShell({ initialDocumentId }: PdfStudioShellProps) {
  const router = useRouter();
  const docsState = usePdfStudioDocs();
  useSyncStudioDocNames(docsState.docs, docsState.refresh);
  // `usePdfStudioDocs` already pulls the `processed_documents` list for the
  // sidebar — opting out of `usePdfExtractor`'s own history fetch removes
  // the duplicate Supabase round-trip that was firing on every mount.
  const extractor = usePdfExtractor({ loadHistory: false });
  const triggerShortcut = useShortcutTrigger();
  const toast = useToastManager("pdf-extractor");
  const dispatch = useAppDispatch();

  // Slice-driven state.
  const activePage = useAppSelector(selectActivePage);
  const pendingScrollPage = useAppSelector(selectPendingScrollPage);
  const visiblePanesArray = useAppSelector(selectVisiblePanesForActiveDoc);
  const sidebarView = useAppSelector(selectSidebarView);
  const visiblePanes = useMemo(
    () => new Set<PaneKey>(visiblePanesArray),
    [visiblePanesArray],
  );

  // Local state that doesn't (yet) need to be shared across features.
  const [activeDoc, setActiveDoc] = useState<PdfDocument | null>(null);
  const activeSourceFileId =
    activeDoc?.sourceKind === "cld_file" && activeDoc.sourceId
      ? activeDoc.sourceId
      : null;
  const { file: activeSourceFile, status: activeSourceStatus } = useFile(
    activeSourceFileId
      ? { kind: "file_id", fileId: activeSourceFileId }
      : null,
  );
  const activeSourceAvailable =
    activeSourceStatus === "ready" &&
    activeSourceFile?.fileId === activeSourceFileId;
  const { renameDocById: renameDocByIdHook, handleRenameActiveDoc } =
    useStudioDocRename({
      docs: docsState.docs,
      setDocName: docsState.setDocName,
      refresh: docsState.refresh,
      activeDoc,
      setActiveDoc,
    });
  const [findQuery, setFindQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  // Server-side in-document search (same engine as the RAG library viewer /
  // chat drawer): Enter in the title pill's search runs it; ranked segment
  // hits render in the Segments pane, matched pages become jump chips. Live
  // typing separately drives the `findQuery` string highlights above.
  const docSearch = useDocumentSearch(activeDoc?.id ?? "");
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [aiCleanRunning, setAiCleanRunning] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [pdfPaneEditMode, setPdfPaneEditMode] = useState<PdfPaneEditMode>(null);
  const [cropPagesInput, setCropPagesInput] = useState("");
  const [copyPagesOpen, setCopyPagesOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Knowledge Asset Builder drawer — opens alongside (not over) the reader, so
  // the doc stays fully visible while building / inspecting representations.
  // The Knowledge Assets inspector TAB was removed (it overflowed the narrow
  // right rail); this resizable drawer replaces it.
  const [knowledgeAssetsOpen, setKnowledgeAssetsOpen] = useState(false);
  const [inspectorRequestedSection, setInspectorRequestedSection] =
    useState<SectionKey | null>(null);
  // True while a doc fetch is in-flight. Initialized to `true` when an
  // initialDocumentId is present so the skeleton shows immediately on mount
  // instead of the upload EmptyShell.
  const [docLoading, setDocLoading] = useState(!!initialDocumentId);

  // Per-page rows for the active doc.
  const {
    pages,
    loading: pagesLoading,
    error: pagesError,
    refresh: refreshPages,
  } = useProcessedDocumentPages({
    processedDocumentId: activeDoc?.id ?? "",
    enabled: !!activeDoc,
  });

  // A batch-uploaded doc finished its FULL server pipeline (extract + clean +
  // chunk + embed + NER) — the hook already refetched the row into its tab;
  // sync the shell's own copies (active doc, page rows, sidebar list).
  const processedDocSignal = extractor.processedDocSignal;
  const activeDocIdRef = useRef<string | null>(null);
  activeDocIdRef.current = activeDoc?.id ?? null;
  useEffect(() => {
    if (!processedDocSignal) return;
    docsState.refresh();
    if (processedDocSignal.docId === activeDocIdRef.current) {
      void extractor.fetchDocument(processedDocSignal.docId).then((fresh) => {
        if (fresh && activeDocIdRef.current === fresh.id) setActiveDoc(fresh);
      });
      refreshPages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per signal
  }, [processedDocSignal]);

  // Live status for the active doc's post-extraction pipeline (batch upload).
  const activeProcessingStatus = activeDoc
    ? (extractor.processingStatus[activeDoc.id] ?? null)
    : null;

  const activeCldFileId =
    activeDoc?.sourceKind === "cld_file" && activeDoc.sourceId
      ? activeDoc.sourceId
      : null;
  const viewedExtractionJobId = useAppSelector((s) =>
    selectViewedJobForFile(s, activeCldFileId),
  );
  const extractionRunProgress = useAppSelector((s) =>
    selectRunProgress(
      s,
      viewedExtractionJobId && !isAllJobsView(viewedExtractionJobId)
        ? viewedExtractionJobId
        : null,
    ),
  );
  const prevExtractionRunStatus = useRef(extractionRunProgress.status);

  // When a chunk extraction run starts, surface the Extractions reader pane
  // so the user can watch chunk/output streaming — even if they closed it.
  useEffect(() => {
    const prev = prevExtractionRunStatus.current;
    prevExtractionRunStatus.current = extractionRunProgress.status;
    if (
      extractionRunProgress.status === "running" &&
      prev !== "running" &&
      activeDoc
    ) {
      dispatch(ensurePaneVisible("extractions"));
    }
  }, [extractionRunProgress.status, activeDoc, dispatch]);

  // Auto-pick first page once pages land.
  useEffect(() => {
    if (!activeDoc) return;
    if (pages.length > 0 && activePage == null) {
      dispatch(setScrollSource(null));
      dispatch(setActivePage(pages[0].pageNumber));
    }
  }, [activeDoc, pages, activePage, dispatch]);

  // Clean up slice state when the shell unmounts (e.g. navigation away).
  useEffect(() => {
    return () => {
      dispatch(clearActiveDoc());
    };
  }, [dispatch]);

  // ── Doc selection ─────────────────────────────────────────────────────

  const selectDocById = useCallback(
    async (id: string) => {
      setDocLoading(true);
      // Tell the slice immediately so persistence middleware can hydrate
      // the per-doc pane visibility before the reader mounts.
      dispatch(setActiveDocId(id));
      const full = await extractor.fetchDocument(id);
      if (full) {
        setActiveDoc(full);
      } else {
        toast.error("Could not load that document");
      }
      setDocLoading(false);
    },
    [extractor, toast, dispatch],
  );

  // Initial load if a doc id is in the URL.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current || !initialDocumentId) return;
    didInitRef.current = true;
    void selectDocById(initialDocumentId);
  }, [initialDocumentId, selectDocById]);

  const handleDeleteDoc = useCallback(
    async (id: string) => {
      await docsState.deleteDoc(id);
      // If we just deleted the doc we're viewing, drop it and return to the
      // studio root so the user isn't left staring at a deleted document.
      if (activeDoc?.id === id) {
        setActiveDoc(null);
        dispatch(clearActiveDoc());
        router.push("/tools/pdf-extractor");
      }
    },
    [docsState, activeDoc, dispatch, router],
  );

  const handleRenameDoc = handleRenameActiveDoc;
  const handleRenameDocById = renameDocByIdHook;

  const handleSelectDoc = useCallback(
    (summary: StudioDocSummary) => {
      // Set a provisional doc immediately from the sidebar metadata so the
      // PDF viewer and inspector appear without waiting for the full fetch.
      setActiveDoc(summaryToProvisionalDoc(summary));
      dispatch(setActiveDocId(summary.id));
      router.push(`/tools/pdf-extractor/${summary.id}`);
      void selectDocById(summary.id);
    },
    [router, selectDocById, dispatch],
  );

  // ── Page nav ──────────────────────────────────────────────────────────

  const jumpToPage = useCallback(
    (n: number) => {
      dispatch(setScrollSource(null));
      dispatch(setActivePage(n));
      dispatch(setPendingScrollPage(n));
    },
    [dispatch],
  );

  // ── In-document search (title pill, Enter) ───────────────────────────
  // Runs the RAG lexical search, surfaces the Segments pane with the ranked
  // hits, and jumps to the first matching page. An empty submit clears.
  const { run: runDocSearch, clear: clearDocSearch } = docSearch;
  const activePageRef = useRef(activePage);
  activePageRef.current = activePage;
  const handleFindSubmit = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      setFindQuery(trimmed);
      if (!trimmed) {
        clearDocSearch();
        return;
      }
      dispatch(ensurePaneVisible("chunks"));
      void runDocSearch(trimmed).then((matchedPages) => {
        const cur = activePageRef.current;
        if (
          matchedPages.length > 0 &&
          (cur == null || !matchedPages.includes(cur))
        ) {
          jumpToPage(matchedPages[0]);
        }
      });
    },
    [runDocSearch, clearDocSearch, dispatch, jumpToPage],
  );

  // Doc switch — drop the previous document's search results.
  const activeDocId = activeDoc?.id ?? null;
  const prevDocIdRef = useRef(activeDocId);
  useEffect(() => {
    if (prevDocIdRef.current !== activeDocId) {
      prevDocIdRef.current = activeDocId;
      clearDocSearch();
      setFindQuery("");
    }
  }, [activeDocId, clearDocSearch]);

  const handleActivePage = useCallback(
    (n: number | null) => {
      dispatch(setActivePage(n));
    },
    [dispatch],
  );

  const handleScrollHandled = useCallback(() => {
    dispatch(clearPendingScroll());
  }, [dispatch]);

  // ── Pane toggles ──────────────────────────────────────────────────────

  const togglePane = useCallback(
    (p: PaneKey) => {
      dispatch(togglePaneAction(p));
    },
    [dispatch],
  );

  // ── Sidebar view ──────────────────────────────────────────────────────

  const handleChangeSidebarView = useCallback(
    (view: "files" | "pages") => {
      dispatch(setSidebarView(view));
    },
    [dispatch],
  );

  // Live preview text written by the AI Clean / Pipeline stream so the
  // cleaned pane can render token-by-token deltas instead of a blank
  // spinner. Cleared once the run finalizes against Supabase.
  const [streamingCleanText, setStreamingCleanText] = useState<string | null>(
    null,
  );

  // ── Pipeline run ──────────────────────────────────────────────────────
  //
  // Pipeline creates a NEW child `processed_documents` row (per-page rows
  // live on the child, not on the parent we started from). The studio
  // surfaces no parent/child concept, so on success we silently
  // `router.replace` to the new doc — from the user's POV their data
  // "refreshed" on the same screen.

  const handleRunPipeline = useCallback(async () => {
    if (!activeDoc) return;
    setPipelineRunning(true);
    setLiveStatus("Starting pipeline…");
    setStreamingCleanText("");
    try {
      const openTab = extractor.tabs.find((t) => t.id === activeDoc.id);
      if (!openTab) {
        extractor.openDocument(activeDoc);
      }
      const { success, childDocId } = await extractor.runFullPipeline(
        activeDoc.id,
        {
          onProgress: setLiveStatus,
          onTextDelta: setStreamingCleanText,
        },
      );
      if (!success) {
        toast.error("Pipeline run failed");
        return;
      }

      if (childDocId && childDocId !== activeDoc.id) {
        // Silently swap the URL to the child without pushing history —
        // the parent is no longer the row carrying the new data and we
        // don't want a back button to deposit the user on a stale doc.
        dispatch(setActiveDocId(childDocId));
        router.replace(`/tools/pdf-extractor/${childDocId}`);
        await selectDocById(childDocId);
      } else {
        // Same-row update (no child created). Refresh in place.
        const fresh = await extractor.fetchDocument(activeDoc.id);
        if (fresh) setActiveDoc(fresh);
        refreshPages();
      }
      docsState.refresh();
      toast.success("Pipeline run complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pipeline failed");
    } finally {
      setPipelineRunning(false);
      setLiveStatus(null);
      setStreamingCleanText(null);
    }
  }, [
    activeDoc,
    extractor,
    docsState,
    toast,
    dispatch,
    router,
    selectDocById,
    refreshPages,
  ]);

  // ── AI Clean ──────────────────────────────────────────────────────────
  //
  // Routes through the hook (`extractor.cleanContent`), which handles the
  // stream + cache invalidation + Supabase refetch in one place. The
  // shell just owns the live-status / streaming-preview UI state.

  const handleRunAiClean = useCallback(async () => {
    if (!activeDoc) return;
    setAiCleanRunning(true);
    setLiveStatus("Starting AI cleanup…");
    setStreamingCleanText("");
    try {
      const openTab = extractor.tabs.find((t) => t.id === activeDoc.id);
      if (!openTab) {
        extractor.openDocument(activeDoc);
      }
      await extractor.cleanContent(activeDoc.id, {
        onProgress: setLiveStatus,
        onTextDelta: setStreamingCleanText,
      });
      // The hook has already invalidated the cache + refetched. Re-read
      // through the public surface so the active-doc state reflects what
      // the hook's tab now holds.
      const fresh = await extractor.fetchDocument(activeDoc.id);
      if (fresh) setActiveDoc(fresh);
      refreshPages();
      docsState.refresh();
      toast.success("AI cleanup complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI cleanup failed");
    } finally {
      setAiCleanRunning(false);
      setLiveStatus(null);
      setStreamingCleanText(null);
    }
  }, [activeDoc, extractor, docsState, refreshPages, toast]);

  const handleRefresh = useCallback(async () => {
    if (!activeDoc) return;
    setRefreshing(true);
    try {
      const ok = await extractor.refreshDocument(activeDoc.id);
      if (!ok) {
        toast.error("Could not refresh this document");
        return;
      }
      const fresh = await extractor.fetchDocument(activeDoc.id);
      if (fresh) setActiveDoc(fresh);
      refreshPages();
      docsState.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, [activeDoc, extractor, refreshPages, docsState, toast]);

  // ── PDF pane edit modes (crop / reorder) ─────────────────────────────

  const handleStartCrop = useCallback((pagesInput: string) => {
    setCropPagesInput(pagesInput);
    setPdfPaneEditMode("crop");
  }, []);

  const handleStartReorder = useCallback(() => {
    setPdfPaneEditMode("reorder");
  }, []);

  const handleEditModeCancel = useCallback(() => {
    setPdfPaneEditMode(null);
    setCropPagesInput("");
  }, []);

  // ── Upload hand-off ───────────────────────────────────────────────────

  const handleFirstUpload = useCallback(
    (docId: string) => {
      docsState.refresh();
      if (!activeDoc) {
        router.push(`/tools/pdf-extractor/${docId}`);
        void selectDocById(docId);
      }
    },
    [docsState, activeDoc, router, selectDocById],
  );

  const handleUploadComplete = useCallback(
    (newDocIds: string[]) => {
      docsState.refresh();
      if (!activeDoc && newDocIds[0]) {
        router.push(`/tools/pdf-extractor/${newDocIds[0]}`);
        void selectDocById(newDocIds[0]);
      }
    },
    [docsState, activeDoc, router, selectDocById],
  );

  // ── Open the source PDF ───────────────────────────────────────────────────
  //
  // Documents are identified by their cld_files source id — never a raw
  // storage location. cld_file-backed docs open in the in-app file viewer
  // `/files/f/{id}` (auth-safe, progressive PDF render, no expiring URL);
  // anything else has no browser-openable source.
  const handleOpenSource = useCallback(() => {
    if (!activeDoc) return;
    if (activeDoc.sourceKind === "cld_file" && activeDoc.sourceId) {
      window.open(
        `/files/f/${activeDoc.sourceId}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    toast.error("This document's original file isn't directly viewable.");
  }, [activeDoc, toast]);

  const handleRunShortcut = useCallback(
    async (shortcutId: string) => {
      if (!activeDoc) return;
      const docText = activeDoc.cleanContent ?? activeDoc.content ?? "";
      if (!docText) {
        toast.error("No extracted content yet");
        return;
      }
      try {
        await triggerShortcut(shortcutId, {
          scope: { selection: docText },
          sourceFeature: "pdf-extractor",
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Run failed");
      }
    },
    [activeDoc, triggerShortcut, toast],
  );

  // ── Chunked Runs jump (from Chunks pane CTA) ──────────────────────────

  const handleOpenChunkedRuns = useCallback(() => {
    setInspectorOpen(true);
    setInspectorRequestedSection("chunked");
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
        return;
      }
      if (inField) return;

      if (e.key === "/") {
        e.preventDefault();
        setFindOpen(true);
        return;
      }
      if (e.key === "Escape" && findOpen) {
        setFindOpen(false);
        setFindQuery("");
        return;
      }
      if (e.key === "j" && activePage) jumpToPage(activePage + 1);
      else if (e.key === "k" && activePage && activePage > 1)
        jumpToPage(activePage - 1);
      else if (e.key === "[") togglePane("pdf");
      else if (e.key === "]") togglePane("clean");
      else if (e.key === "\\") togglePane("raw");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePage, jumpToPage, togglePane, findOpen]);

  // Header Agents chrome — live scope for `matrx-user/pdf-extractor`. Mirrors the
  // Widgets tab defaults (full doc as active scope; current page always filled).
  const getPdfExtractorScope = () => {
    if (!activeDoc) {
      return buildPdfExtractorScope({
        full_document_text: "",
        current_page_text: "",
        active_scope_text: "",
        filename: "",
        file_id: "",
        total_pages: 0,
        current_page: 0,
        scope_kind: "full",
        using_clean_text: false,
        visible_panes: visiblePanesArray,
        sidebar_view: sidebarView,
        find_query: findQuery,
        library_document_count: docsState.docs.length,
        library_document_names: docsState.docs.map((d) => d.name),
        pipeline_running: pipelineRunning || aiCleanRunning,
        pipeline_status: liveStatus ?? "",
      });
    }
    const fullText = activeDoc.cleanContent ?? activeDoc.content ?? "";
    const usingClean = !!activeDoc.cleanContent;
    const pageRow =
      activePage != null
        ? pages.find((p) => p.pageNumber === activePage)
        : undefined;
    const currentPageText = pageRow
      ? usingClean
        ? pageRow.cleanedText || pageRow.rawText
        : pageRow.rawText
      : "";
    const fileId =
      activeSourceAvailable && activeDoc.sourceKind === "cld_file" && activeDoc.sourceId
        ? activeDoc.sourceId
        : "";
    const pageNumbers =
      pages.length === 0
        ? ""
        : pages.length === 1
          ? String(pages[0]!.pageNumber)
          : `${pages[0]!.pageNumber}-${pages[pages.length - 1]!.pageNumber}`;

    return buildPdfExtractorScope({
      full_document_text: fullText,
      current_page_text: currentPageText,
      active_scope_text: fullText,
      filename: activeDoc.name,
      file_id: fileId,
      processed_document_id: activeDoc.id,
      total_pages: pages.length || activeDoc.totalPages || 0,
      current_page: activePage ?? 0,
      page_numbers: pageNumbers || undefined,
      scope_kind: "full",
      using_clean_text: usingClean,
      selected_text: window.getSelection()?.toString().trim() ?? "",
      raw_document_text: activeDoc.content ?? "",
      page_texts: pages.map((p) => ({
        page_number: p.pageNumber,
        text: usingClean ? p.cleanedText || p.rawText : p.rawText,
        cleaned: usingClean && !!p.cleanedText,
      })),
      visible_panes: visiblePanesArray,
      sidebar_view: sidebarView,
      find_query: findQuery,
      library_document_count: docsState.docs.length,
      library_document_names: docsState.docs.map((d) => d.name),
      pipeline_running:
        pipelineRunning ||
        aiCleanRunning ||
        extractionRunProgress.status === "running",
      pipeline_status: activeProcessingStatus?.status ?? liveStatus ?? "",
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/pdf-extractor"
      getScope={getPdfExtractorScope}
      isEditable={false}
    >
      <PageHeader>
        <PdfStudioHeaderControls
          doc={activeDoc}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          inspectorOpen={inspectorOpen}
          onToggleInspector={() => setInspectorOpen((v) => !v)}
          activePage={activePage}
          totalPages={activeDoc?.totalPages ?? pages.length}
          onJumpToPage={jumpToPage}
          onOpenFind={() => setFindOpen(true)}
          onRunPipeline={handleRunPipeline}
          pipelineRunning={pipelineRunning}
          onRunAiClean={handleRunAiClean}
          aiCleanRunning={aiCleanRunning}
          onOpenKnowledgeAssets={() => setKnowledgeAssetsOpen(true)}
          onOpenCopyPages={() => setCopyPagesOpen(true)}
          onRefresh={() => void handleRefresh()}
          refreshing={refreshing}
          onOpenSource={handleOpenSource}
          onRename={handleRenameDoc}
          onDeleteDoc={handleDeleteDoc}
          docs={docsState.docs}
          onSelectDoc={handleSelectDoc}
          onFindQueryChange={setFindQuery}
          onFindSubmit={handleFindSubmit}
        />
      </PageHeader>

      <div className="flex h-full min-h-0 bg-background">
        {/* LEFT — sidebar (collapsible). Collapses to width 0 — expand only
            from the shell header's PanelLeftTapButton (tasks pattern). */}
        <div
          className={cn(
            "shrink-0 hidden md:flex flex-col overflow-hidden pt-[var(--shell-header-h)] transition-all duration-200",
            sidebarOpen ? "w-64" : "w-0",
          )}
        >
          {/* Border lives on `<aside>` inside — it starts below the padding
              above, so it never bleeds into the transparent shell header. */}
          {sidebarOpen && (
            <PdfStudioSidebar
              docsState={docsState}
              activeDocId={activeDoc?.id ?? null}
              onSelectDoc={handleSelectDoc}
              onDeleteDoc={handleDeleteDoc}
              onRenameDoc={handleRenameDocById}
              onAddDocs={() => setUploadOpen(true)}
              view={sidebarView}
              onChangeView={handleChangeSidebarView}
              activeDoc={activeDoc}
              pageRowCount={pages.length}
              hasPageRows={pages.length > 0}
              pages={pages}
              pagesLoading={pagesLoading}
              activePage={activePage}
              onSelectPage={jumpToPage}
            />
          )}
        </div>

        {/* Upload drawer */}
        <PdfStudioUploadDrawer
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          extractor={extractor}
          onFirstDocReady={handleFirstUpload}
          onUploadComplete={handleUploadComplete}
        />

        {/* Copy Pages overlay */}
        {activeDoc && (
          <CopyPagesOverlay
            open={copyPagesOpen}
            onClose={() => setCopyPagesOpen(false)}
            doc={activeDoc}
            pages={pages}
            pagesLoading={pagesLoading}
          />
        )}

        {/* Knowledge Asset Builder — resizable right drawer. Replaces the
            removed inspector tab; the reader stays visible behind it. */}
        {activeDoc && (
          <MatrxDynamicPanelHost
            open={knowledgeAssetsOpen}
            onOpenChange={setKnowledgeAssetsOpen}
            title="Knowledge Assets"
            description={activeDoc.name}
            position="right"
            defaultSize={46}
            minSize={28}
            maxSize={80}
            contentClassName="p-0"
          >
            <KnowledgeAssetPanel
              doc={{
                id: activeDoc.id,
                name: activeDoc.name,
                totalPages: activeDoc.totalPages,
              }}
            />
          </MatrxDynamicPanelHost>
        )}

        {/* CENTER */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 pt-[var(--shell-header-h)]">
          {/* Live status — pipeline / AI clean streaming progress */}
          <LiveStatusStrip
            pipelineRunning={pipelineRunning}
            aiCleanRunning={aiCleanRunning}
            liveStatus={liveStatus ?? activeProcessingStatus}
          />

          {/* Hidden-panes restore strip */}
          <PaneVisibilityStrip
            visiblePanes={visiblePanes}
            onTogglePane={togglePane}
          />

          {/* Find bar */}
          {findOpen && (
            <div className="shrink-0 px-4 py-1.5 border-b border-border bg-card/40 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={findQuery}
                onChange={(e) => setFindQuery(e.target.value)}
                placeholder="Find in document…"
                className="h-7 text-xs flex-1"
                style={{ fontSize: "16px" }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setFindOpen(false);
                    setFindQuery("");
                  }
                }}
              />
              <span className="text-[10px] text-muted-foreground">
                {findQuery
                  ? "highlighted in raw + cleaned"
                  : "press Esc to close"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setFindOpen(false);
                  setFindQuery("");
                }}
                className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                title="Close find (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Reader */}
          {activeDoc ? (
            <PdfStudioReader
              doc={activeDoc}
              pages={pages}
              loading={pagesLoading}
              error={pagesError}
              activePage={activePage}
              onActivePage={handleActivePage}
              pendingScrollPage={pendingScrollPage}
              onScrollHandled={handleScrollHandled}
              visiblePanes={visiblePanes}
              onTogglePane={togglePane}
              findQuery={findQuery}
              onRunPipeline={handleRunPipeline}
              pipelineRunning={pipelineRunning}
              onRunAiClean={handleRunAiClean}
              aiCleanRunning={aiCleanRunning}
              streamingCleanText={streamingCleanText}
              streamingStatus={liveStatus ?? activeProcessingStatus}
              onOpenUpload={() => setUploadOpen(true)}
              editMode={pdfPaneEditMode}
              cropPagesInput={cropPagesInput}
              onEditModeCancel={handleEditModeCancel}
              onRefreshPages={refreshPages}
              onJumpToPage={jumpToPage}
              docSearch={docSearch}
              // Pane ✕ dismisses the RESULTS view only; the pill's own X /
              // Esc clears everything (query + highlights) via onFindSubmit("").
              onClearDocSearch={clearDocSearch}
              onOpenChunkedRuns={handleOpenChunkedRuns}
            />
          ) : docLoading ? (
            <DocLoadingSkeleton />
          ) : (
            <EmptyShell
              extractor={extractor}
              onFirstDocReady={handleFirstUpload}
              onUploadComplete={handleUploadComplete}
            />
          )}
        </div>

        {/* RIGHT — inspector (collapsible). Collapses to width 0 — expand
            only from the shell header's PanelRightTapButton (tasks pattern). */}
        <div
          className={cn(
            "shrink-0 hidden lg:flex flex-col overflow-hidden pt-[var(--shell-header-h)] transition-all duration-200 min-h-0",
            inspectorOpen ? "w-80 xl:w-96" : "w-0",
          )}
        >
          {/* Border lives on `<aside>` inside (PdfStudioInspector) — starts
              below the padding above, never bleeds into the shell header. */}
          {inspectorOpen &&
            (activeDoc ? (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <PdfStudioInspector
                  doc={activeDoc}
                  pages={pages}
                  activePage={activePage}
                  onRunShortcut={handleRunShortcut}
                  onRunPipeline={handleRunPipeline}
                  pipelineRunning={pipelineRunning}
                  pdfPaneEditMode={pdfPaneEditMode}
                  onStartCrop={handleStartCrop}
                  onStartReorder={handleStartReorder}
                  onEditModeCancel={handleEditModeCancel}
                  requestedSection={inspectorRequestedSection}
                  onSectionConsumed={() => setInspectorRequestedSection(null)}
                />
              </div>
            ) : (
              <div className="flex-1 bg-card/30" />
            ))}
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}

/** Live status — pipeline / AI clean streaming progress, under the header. */
function LiveStatusStrip({
  pipelineRunning,
  aiCleanRunning,
  liveStatus,
}: {
  pipelineRunning: boolean;
  aiCleanRunning: boolean;
  liveStatus: string | null;
}) {
  if (!pipelineRunning && !aiCleanRunning && !liveStatus) return null;
  return (
    <div className="shrink-0 px-4 py-1 border-b border-border bg-primary/5 flex items-center gap-2 text-[10px]">
      <Loader2 className="w-2.5 h-2.5 animate-spin text-primary shrink-0" />
      <span className="font-medium text-primary shrink-0">
        {aiCleanRunning ? "AI cleanup" : "Pipeline"} running
      </span>
      {liveStatus && (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground truncate">{liveStatus}</span>
        </>
      )}
    </div>
  );
}

/** Shown while a document is being fetched. */
function DocLoadingSkeleton() {
  return (
    <div className="flex-1 flex min-h-0 flex-col">
      <div className="flex items-center justify-end px-4 py-2 border-b border-border">
        <PdfBatchExtractDebugTrigger autoOpenOnStream={false} />
      </div>
      <div className="flex flex-1 min-h-0">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex-1 min-w-0 flex flex-col border-r last:border-r-0 border-border p-3 gap-3"
          >
            <div className="h-4 w-28 rounded bg-muted/50 animate-pulse" />
            <div className="h-40 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-24 w-full rounded bg-muted/30 animate-pulse" />
            <div className="h-24 w-full rounded bg-muted/20 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyShell({
  extractor,
  onFirstDocReady,
  onUploadComplete,
}: {
  extractor: ReturnType<typeof usePdfExtractor>;
  onFirstDocReady: (docId: string) => void;
  onUploadComplete: (ids: string[]) => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
      <div className="w-full max-w-2xl space-y-6">
        <PdfStudioUpload
          extractor={extractor}
          variant="hero"
          headline="Add documents to start reading"
          subhead="Drop in PDFs or images. Each file streams through extraction and lands in your sidebar the moment it's ready — the first one auto-opens here so you can start triaging immediately."
          onFirstDocReady={onFirstDocReady}
          onUploadComplete={onUploadComplete}
        />
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground/70">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">
              /
            </kbd>{" "}
            search ·{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">
              j / k
            </kbd>{" "}
            pages ·{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">
              [ ] \\
            </kbd>{" "}
            toggle panes ·{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">
              ⌘ F
            </kbd>{" "}
            find
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Pane visibility strip ─────────────────────────────────────────────────

function PaneVisibilityStrip({
  visiblePanes,
  onTogglePane,
}: {
  visiblePanes: Set<PaneKey>;
  onTogglePane: (p: PaneKey) => void;
}) {
  const hidden = PANE_ORDER.filter((p) => !visiblePanes.has(p));
  if (hidden.length === 0) return null;
  const labels: Record<PaneKey, string> = {
    pdf: "Source PDF",
    raw: "Raw text",
    clean: "AI-cleaned",
    chunks: RAG_VOCAB.segmentsShort,
    extractions: "Extractions",
  };
  return (
    <div className="shrink-0 px-4 py-1 border-b border-border bg-amber-500/5 flex items-center gap-2 text-[10px]">
      <span className="text-muted-foreground">Hidden panes:</span>
      {hidden.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onTogglePane(p)}
          className={cn(
            "px-1.5 h-5 rounded border border-border bg-background hover:bg-accent",
          )}
        >
          + {labels[p]}
        </button>
      ))}
    </div>
  );
}
