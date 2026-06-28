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
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import {
  PanelLeftTapButton,
  PanelRightTapButton,
} from "@/components/icons/tap-buttons";
import { cn } from "@/lib/utils";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { Input } from "@/components/ui/input";
import { supabase } from "@/utils/supabase/client";
import { renameFile } from "@/features/files/redux/thunks";
import { usePdfExtractor, type PdfDocument } from "../hooks/usePdfExtractor";
import { useProcessedDocumentPages } from "../hooks/useProcessedDocumentPages";
import {
  usePdfStudioDocs,
  type StudioDocSummary,
} from "./hooks/usePdfStudioDocs";
import { PdfStudioSidebar } from "./PdfStudioSidebar";
import { PdfStudioToolbar } from "./PdfStudioToolbar";
import { PdfStudioReader, type PdfPaneEditMode } from "./PdfStudioReader";
import { PdfStudioInspector, type SectionKey } from "./PdfStudioInspector";
import { PdfStudioUpload } from "./PdfStudioUpload";
import { PdfStudioUploadDrawer } from "./PdfStudioUploadDrawer";
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
    source: s.source,
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
  const [findQuery, setFindQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
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

  const handleRenameDoc = useCallback(
    async (newName: string) => {
      if (!activeDoc) return;
      const trimmed = newName.trim();
      if (!trimmed || trimmed === activeDoc.name) return;
      const previousName = activeDoc.name;
      // Optimistic — the toolbar reflects the new name instantly.
      setActiveDoc((d) => (d ? { ...d, name: trimmed } : d));
      try {
        // `processed_documents.name` is the studio's source of truth for the
        // title — persist it authoritatively.
        const { error } = await (supabase as any)
          .schema("docproc").from("processed_documents")
          .update({ name: trimmed })
          .eq("id", activeDoc.id);
        if (error) throw new Error(error.message);
        // Keep the backing cloud file in lock-step so the /files route and
        // every other surface show the same name. Best-effort — a file
        // rename failure shouldn't roll back the doc rename.
        if (activeDoc.sourceKind === "cld_file" && activeDoc.sourceId) {
          void dispatch(
            renameFile({ fileId: activeDoc.sourceId, newName: trimmed }),
          )
            .unwrap()
            .catch(() => undefined);
        }
        docsState.refresh();
      } catch (err) {
        setActiveDoc((d) => (d ? { ...d, name: previousName } : d));
        toast.error(err instanceof Error ? err.message : "Rename failed");
      }
    },
    [activeDoc, dispatch, docsState, toast],
  );

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
  // The stored `source` is `processed_documents.storage_uri` — for the common
  // cld_file path that's an `s3://…` URI. `window.open("s3://…")` opens a tab
  // the browser can never navigate to (blank, forever). Resolve to something
  // the browser can actually show:
  //   - cld_file-backed → the in-app file viewer `/files/f/{id}` (auth-safe,
  //     progressive PDF render, no expiring URL).
  //   - http(s) source   → open the URL directly.
  //   - anything else (s3://, supabase://, none) is not directly openable.
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
    const src = activeDoc.source?.trim();
    if (src && (src.startsWith("http://") || src.startsWith("https://"))) {
      window.open(src, "_blank", "noopener,noreferrer");
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
          sourceFeature: "programmatic",
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

  return (
    <div className="flex h-full min-h-0 bg-background">
      {/* LEFT — sidebar (collapsible) */}
      <div
        className={cn(
          "shrink-0 hidden md:flex flex-col border-r border-border transition-all duration-200",
          sidebarOpen ? "w-64" : "w-11",
        )}
      >
        {sidebarOpen ? (
          <>
            <div className="flex shrink-0 items-center justify-end border-b border-border">
              <PanelLeftTapButton
                variant="transparent"
                onClick={() => setSidebarOpen(false)}
                ariaLabel="Collapse sidebar"
              />
            </div>
            <PdfStudioSidebar
              docsState={docsState}
              activeDocId={activeDoc?.id ?? null}
              onSelectDoc={handleSelectDoc}
              onDeleteDoc={handleDeleteDoc}
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
          </>
        ) : (
          <CollapsedPanelRail
            chevron="right"
            ariaLabel="Expand sidebar"
            onClick={() => setSidebarOpen(true)}
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

      {/* Knowledge Asset Builder — resizable right drawer. Replaces the removed
          inspector tab; the reader stays visible behind it. */}
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
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <PdfStudioToolbar
          doc={activeDoc}
          activePage={activePage}
          totalPages={activeDoc?.totalPages ?? pages.length}
          onJumpToPage={jumpToPage}
          onOpenFind={() => setFindOpen(true)}
          onRunPipeline={handleRunPipeline}
          pipelineRunning={pipelineRunning}
          onRunAiClean={handleRunAiClean}
          aiCleanRunning={aiCleanRunning}
          liveStatus={liveStatus}
          onOpenSource={handleOpenSource}
          onOpenCopyPages={() => setCopyPagesOpen(true)}
          onRefresh={() => void handleRefresh()}
          refreshing={refreshing}
          onRename={handleRenameDoc}
          onDeleteDoc={handleDeleteDoc}
          onOpenKnowledgeAssets={() => setKnowledgeAssetsOpen(true)}
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
            aiCleanRunning={aiCleanRunning}
            streamingCleanText={streamingCleanText}
            onOpenUpload={() => setUploadOpen(true)}
            editMode={pdfPaneEditMode}
            cropPagesInput={cropPagesInput}
            onEditModeCancel={handleEditModeCancel}
            onRefreshPages={refreshPages}
            onJumpToPage={jumpToPage}
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

      {/* RIGHT — inspector (collapsible) */}
      <div
        className={cn(
          "shrink-0 hidden lg:flex flex-col border-l border-border transition-all duration-200",
          inspectorOpen ? "w-80 xl:w-96" : "w-11",
        )}
      >
        {inspectorOpen ? (
          <>
            <div className="flex shrink-0 items-center justify-start border-b border-border">
              <PanelRightTapButton
                variant="transparent"
                onClick={() => setInspectorOpen(false)}
                ariaLabel="Collapse inspector"
              />
            </div>
            {activeDoc ? (
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
            ) : (
              <div className="flex-1 bg-card/30" />
            )}
          </>
        ) : (
          <CollapsedPanelRail
            chevron="left"
            ariaLabel="Expand inspector"
            onClick={() => setInspectorOpen(true)}
          />
        )}
      </div>
    </div>
  );
}

/** Collapsed side rail — full-height hit target with a centered chevron hint. */
function CollapsedPanelRail({
  chevron,
  ariaLabel,
  onClick,
}: {
  chevron: "left" | "right";
  ariaLabel: string;
  onClick: () => void;
}) {
  const Icon = chevron === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex min-h-0 flex-1 w-full items-center justify-center text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
    </button>
  );
}

/** Shown while a document is being fetched. */
function DocLoadingSkeleton() {
  return (
    <div className="flex-1 flex min-h-0">
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
