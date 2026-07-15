"use client";

/**
 * PdfStudioMobile — single-column iOS-style layout.
 *
 *   ┌────────────────────────┐
 *   │ ‹ Title       ⋮ inspector │
 *   ├────────────────────────┤
 *   │ Tab: PDF | Raw | Clean │
 *   ├────────────────────────┤
 *   │                        │
 *   │   active pane          │
 *   │   (full-bleed)         │
 *   │                        │
 *   ├────────────────────────┤
 *   │ ‹  page 5 / 142  ›     │
 *   └────────────────────────┘
 *
 * The doc list is reachable via the `←` chevron (drawer overlay).
 * The inspector slides in from the right via the kebab menu.
 *
 * No horizontal split panes on mobile — switching between PDF / raw /
 * cleaned is tab-based, which is the canonical mobile pattern in this
 * app per `.cursor/skills/ios-mobile-first/SKILL.md` (no nested scrolling,
 * no Dialog, no tabs that try to fit side-by-side).
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  Webhook,
  Lightbulb,
  Layers,
  Loader2,
  MoreVertical,
  Sparkles,
  X,
  Plus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { TapTargetButton } from "@/components/icons/TapTargetButton";
import { usePdfExtractor, type PdfDocument } from "../hooks/usePdfExtractor";
import { useProcessedDocumentPages } from "../hooks/useProcessedDocumentPages";
import { PdfAiContent } from "../components/PdfAiContent";
import { usePdfStudioDocs } from "./hooks/usePdfStudioDocs";
import { PdfStudioSidebar } from "./PdfStudioSidebar";
import { useSyncStudioDocNames } from "./hooks/useSyncStudioDocNames";
import { useStudioDocRename } from "./hooks/useStudioDocRename";
import { PdfCldFileViewer } from "./PdfStudioReader";
import { PdfStudioInspector } from "./PdfStudioInspector";
import { PdfStudioUpload } from "./PdfStudioUpload";
import { PdfStudioUploadDrawer } from "./PdfStudioUploadDrawer";
import { useShortcutTrigger } from "@/features/agents/hooks/useShortcutTrigger";
import { useToastManager } from "@/hooks/useToastManager";

interface PdfStudioMobileProps {
  initialDocumentId?: string;
}

type MobileTab = "pdf" | "raw" | "clean";

export function PdfStudioMobile({ initialDocumentId }: PdfStudioMobileProps) {
  const router = useRouter();
  const docsState = usePdfStudioDocs();
  useSyncStudioDocNames(docsState.docs, docsState.refresh);
  const extractor = usePdfExtractor();
  const triggerShortcut = useShortcutTrigger();
  const toast = useToastManager("pdf-extractor");

  const [activeDoc, setActiveDoc] = useState<PdfDocument | null>(null);
  const { renameDocById } = useStudioDocRename({
    docs: docsState.docs,
    setDocName: docsState.setDocName,
    refresh: docsState.refresh,
    activeDoc,
    setActiveDoc,
  });
  const [tab, setTab] = useState<MobileTab>("clean");
  const [activePage, setActivePage] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<"none" | "docs" | "inspector">(
    initialDocumentId ? "none" : "docs",
  );
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [aiCleanRunning, setAiCleanRunning] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [streamingCleanText, setStreamingCleanText] = useState<string | null>(
    null,
  );

  const { pages, refresh: refreshPages } = useProcessedDocumentPages({
    processedDocumentId: activeDoc?.id ?? "",
    enabled: !!activeDoc,
  });

  useEffect(() => {
    if (!activeDoc) {
      setActivePage(null);
      return;
    }
    if (pages.length > 0 && activePage == null) {
      setActivePage(pages[0].pageNumber);
    }
  }, [activeDoc, pages, activePage]);

  const selectDocById = useCallback(
    async (id: string) => {
      const full = await extractor.fetchDocument(id);
      if (full) {
        setActiveDoc(full);
        setActivePage(null);
        setDrawer("none");
      } else {
        toast.error("Could not load that document");
      }
    },
    [extractor, toast],
  );

  // Initial doc id
  useEffect(() => {
    if (initialDocumentId) void selectDocById(initialDocumentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocumentId]);

  const onSelectDoc = useCallback(
    (s: { id: string }) => {
      router.push(`/tools/pdf-extractor/${s.id}`);
      void selectDocById(s.id);
    },
    [router, selectDocById],
  );

  const handleDeleteDoc = useCallback(
    async (id: string) => {
      await docsState.deleteDoc(id);
      if (activeDoc?.id === id) {
        setActiveDoc(null);
        router.push("/tools/pdf-extractor");
      }
    },
    [docsState, activeDoc, router],
  );

  // Upload hand-off — same shape as desktop. Auto-opens the first new doc
  // in the reader so the manager goes from "drop file" to "reading" with
  // zero extra taps.
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

  const handleRunPipeline = useCallback(async () => {
    if (!activeDoc) return;
    setPipelineRunning(true);
    setLiveStatus("Starting pipeline…");
    setStreamingCleanText("");
    try {
      const openTab = extractor.tabs.find((t) => t.id === activeDoc.id);
      if (!openTab) extractor.openDocument(activeDoc);
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
      // Pipeline creates a new child row — silently swap the URL so the
      // mobile shell reads the new per-page data without exposing the
      // parent/child concept. Same pattern as desktop.
      if (childDocId && childDocId !== activeDoc.id) {
        router.replace(`/tools/pdf-extractor/${childDocId}`);
        await selectDocById(childDocId);
      } else {
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
    router,
    selectDocById,
    refreshPages,
  ]);

  // AI Clean — desktop parity. Routes through `extractor.cleanContent` for
  // the same finalize sequence (invalidate cache → refetch → render).
  const handleRunAiClean = useCallback(async () => {
    if (!activeDoc) return;
    setAiCleanRunning(true);
    setLiveStatus("Starting AI cleanup…");
    setStreamingCleanText("");
    setTab("clean"); // jump the user to the pane that's about to fill
    try {
      const openTab = extractor.tabs.find((t) => t.id === activeDoc.id);
      if (!openTab) extractor.openDocument(activeDoc);
      await extractor.cleanContent(activeDoc.id, {
        onProgress: setLiveStatus,
        onTextDelta: setStreamingCleanText,
      });
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

  const handleRunShortcut = useCallback(
    async (shortcutId: string) => {
      if (!activeDoc) return;
      const docText = activeDoc.cleanContent ?? activeDoc.content ?? "";
      if (!docText) return;
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

  const total = activeDoc?.totalPages ?? pages.length;

  return (
    <>
      {/* Route chrome lives in the shell header center zone — never an
          in-body bar (that duplicates the shell row and collides with the
          fixed avatar). Doc identity + actions as glass tap targets. */}
      <RouteHeader
        left={
          <>
            <TapTargetButton
              icon={<ArrowLeft className="h-4 w-4" />}
              ariaLabel="Documents"
              onClick={() => setDrawer("docs")}
            />
            <div className="min-w-0 ml-1">
              {activeDoc ? (
                <span className="truncate max-w-[38vw] block text-sm font-medium text-foreground">
                  {activeDoc.name}
                </span>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">
                  PDF Studio
                </span>
              )}
            </div>
          </>
        }
        right={
          <>
            <TapTargetButton
              icon={<Plus className="h-4 w-4" />}
              ariaLabel="Add documents"
              onClick={() => setUploadOpen(true)}
            />
            {/* AI Clean — mobile parity with desktop toolbar. Disabled while
                any run is in flight; the spinner doubles as the "is running"
                signal so we don't need a second status pill in the header. */}
            {activeDoc && (
              <TapTargetButton
                icon={
                  aiCleanRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )
                }
                ariaLabel="AI Clean"
                onClick={handleRunAiClean}
                disabled={aiCleanRunning || pipelineRunning}
              />
            )}
            <TapTargetButton
              icon={<MoreVertical className="h-4 w-4" />}
              ariaLabel="Inspector"
              onClick={() => setDrawer("inspector")}
              disabled={!activeDoc}
            />
          </>
        }
      />
    <div className="flex h-full min-h-0 flex-col bg-background pt-[var(--shell-header-h)]">
      {/* Live status strip — visible only while a run is streaming. Mirrors
          the desktop toolbar pattern so the user has a steady "the model
          is working" signal that doesn't depend on the toast lifecycle. */}
      {liveStatus && (
        <div className="shrink-0 border-b border-border bg-primary/5 px-3 py-1.5 flex items-center gap-2 text-[11px] text-primary">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="truncate">{liveStatus}</span>
        </div>
      )}

      {/* Tab strip — only when a doc is open */}
      {activeDoc && (
        <div className="shrink-0 grid grid-cols-3 border-b border-border">
          <TabBtn
            active={tab === "pdf"}
            onClick={() => setTab("pdf")}
            icon={<Layers className="w-3.5 h-3.5" />}
            label="PDF"
          />
          <TabBtn
            active={tab === "raw"}
            onClick={() => setTab("raw")}
            icon={<FileText className="w-3.5 h-3.5" />}
            label="Raw"
          />
          <TabBtn
            active={tab === "clean"}
            onClick={() => setTab("clean")}
            icon={<Lightbulb className="w-3.5 h-3.5" />}
            label="Cleaned"
          />
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {!activeDoc ? (
          <div className="h-full overflow-y-auto p-4">
            <PdfStudioUpload
              extractor={extractor}
              variant="hero"
              headline="Add documents"
              subhead="Drop in PDFs or images. The first one auto-opens here as soon as it's ready."
              onFirstDocReady={handleFirstUpload}
              onUploadComplete={handleUploadComplete}
            />
          </div>
        ) : tab === "pdf" ? (
          activeDoc.sourceKind === "cld_file" && activeDoc.sourceId ? (
            // Render via pdfjs + the authenticated inline endpoint, the same
            // path the desktop reader uses — files are identified by id,
            // never by a raw storage location.
            <PdfCldFileViewer
              fileId={activeDoc.sourceId}
              fileName={activeDoc.name}
              pageNumber={activePage ?? 1}
              onPageChange={(n) => setActivePage(n)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              No source PDF linked to this record.
            </div>
          )
        ) : (
          <MobileTextScroller
            pages={pages}
            field={tab === "clean" ? "cleaned" : "raw"}
            activePage={activePage}
            onActivePage={(n) => setActivePage(n)}
            fallbackText={
              tab === "clean" ? activeDoc.cleanContent : activeDoc.content
            }
            streaming={tab === "clean" && (aiCleanRunning || pipelineRunning)}
            streamingText={tab === "clean" ? streamingCleanText : null}
          />
        )}
      </div>

      {/* Bottom bar: pager + the agent-engagement entry point. pb-safe
          respects the iOS home indicator. "Agents" opens the inspector
          (AI actions / pipeline / metadata) — the mobile counterpart of
          the desktop right side, promoted out of the kebab so it's a
          first-class action instead of a hidden menu. */}
      {activeDoc && (
        <div className="shrink-0 border-t border-border bg-card/60 px-2 py-1.5 pb-safe flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              activePage && setActivePage(Math.max(1, activePage - 1))
            }
            disabled={!activePage || activePage <= 1 || total === 0}
            className="h-10 w-10 rounded-md border border-border bg-background hover:bg-accent disabled:opacity-50 flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 text-center text-xs">
            <span className="font-mono">
              {activePage ?? 1} / {total}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDrawer("inspector")}
            className="h-10 rounded-md border border-primary/40 bg-primary/10 px-3 text-primary hover:bg-primary/15 flex items-center justify-center gap-1.5 text-xs font-medium"
          >
            <Webhook className="w-4 h-4" />
            Agents
          </button>
          <button
            type="button"
            onClick={() =>
              activePage && setActivePage(Math.min(total, activePage + 1))
            }
            disabled={!activePage || activePage >= total || total === 0}
            className="h-10 w-10 rounded-md border border-border bg-background hover:bg-accent disabled:opacity-50 flex items-center justify-center"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Drawers */}
      <Drawer
        open={drawer === "docs"}
        onOpenChange={(o) => !o && setDrawer("none")}
      >
        <DrawerContent className="h-[85dvh]">
          <div className="flex flex-col h-full min-h-0">
            <div className="shrink-0 px-3 py-2 flex items-center justify-between border-b border-border">
              <span className="text-sm font-semibold">Documents</span>
              <button
                type="button"
                onClick={() => setDrawer("none")}
                className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <PdfStudioSidebar
                docsState={docsState}
                activeDocId={activeDoc?.id ?? null}
                onSelectDoc={onSelectDoc}
                onDeleteDoc={handleDeleteDoc}
                onRenameDoc={renameDocById}
                onAddDocs={() => {
                  setDrawer("none");
                  setUploadOpen(true);
                }}
                view="files"
                onChangeView={() => {}}
                activeDoc={activeDoc}
                pageRowCount={pages.length}
                hasPageRows={pages.length > 0}
                pages={pages}
                pagesLoading={false}
                activePage={activePage}
                onSelectPage={setActivePage}
              />
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <PdfStudioUploadDrawer
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        extractor={extractor}
        onFirstDocReady={handleFirstUpload}
        onUploadComplete={handleUploadComplete}
      />

      <Drawer
        open={drawer === "inspector"}
        onOpenChange={(o) => !o && setDrawer("none")}
      >
        <DrawerContent className="h-[85dvh]">
          <div className="flex flex-col h-full min-h-0">
            <div className="shrink-0 px-3 py-2 flex items-center justify-between border-b border-border">
              <span className="text-sm font-semibold">Inspector</span>
              <button
                type="button"
                onClick={() => setDrawer("none")}
                className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {activeDoc && (
              <div className="flex-1 min-h-0">
                <PdfStudioInspector
                  doc={activeDoc}
                  pages={pages}
                  activePage={activePage}
                  onRunShortcut={handleRunShortcut}
                  onRunPipeline={handleRunPipeline}
                  pipelineRunning={pipelineRunning}
                  pdfPaneEditMode={null}
                  onStartCrop={() => {}}
                  onStartReorder={() => {}}
                  onEditModeCancel={() => {}}
                />
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 h-10 text-xs font-medium border-b-2 transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function MobileTextScroller({
  pages,
  field,
  activePage,
  onActivePage,
  fallbackText,
  streaming = false,
  streamingText = null,
}: {
  pages: {
    id: string;
    pageNumber: number;
    rawText: string;
    cleanedText: string;
  }[];
  field: "raw" | "cleaned";
  activePage: number | null;
  onActivePage: (n: number) => void;
  fallbackText: string | null;
  /** True while AI Clean / Pipeline is actively streaming into `streamingText`. */
  streaming?: boolean;
  /** Live-accumulating text; rendered as a single block while `streaming`. */
  streamingText?: string | null;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const anchorMap = React.useRef<Map<number, HTMLElement>>(new Map());
  // Pager-click and scroll-observation must not fight: a programmatic
  // smooth scroll fires the IntersectionObserver on every page it passes,
  // which used to reset activePage mid-flight and scroll BACK (the "page
  // navigation doesn't work" bug). While a pager-driven scroll is in
  // flight the observer is ignored; observer-driven updates are recorded
  // so they never trigger a re-scroll.
  const programmaticUntilRef = React.useRef(0);
  const lastObservedRef = React.useRef<number | null>(null);

  // True when every per-page row in the active field is empty. Same rule
  // as the desktop reader — per-page `cleaned_text` is only populated by
  // RAG ingestion, not by the agent-based AI Clean endpoint, so we fall
  // back to the aggregate column for the cleaned tab.
  const allEmpty = React.useMemo(
    () =>
      pages.length > 0 &&
      pages.every((p) =>
        field === "cleaned" ? !p.cleanedText.trim() : !p.rawText.trim(),
      ),
    [pages, field],
  );

  // IO observer so the bottom pager reflects the most-visible page. Skip
  // when we're showing the aggregate / streaming block (no anchors).
  React.useEffect(() => {
    if (streaming || allEmpty) return undefined;
    const root = containerRef.current;
    if (!root) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < programmaticUntilRef.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const page = Number(visible.target.getAttribute("data-page") ?? 0);
        if (page) {
          lastObservedRef.current = page;
          onActivePage(page);
        }
      },
      { root, threshold: [0.4] },
    );
    anchorMap.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pages.length, onActivePage, streaming, allEmpty]);

  // Programmatic scroll on activePage change (driven by bottom pager).
  // Skipped when the change came from the observer itself — re-scrolling
  // to a page the user just scrolled to fights their finger.
  React.useEffect(() => {
    if (activePage == null) return;
    if (activePage === lastObservedRef.current) return;
    const el = anchorMap.current.get(activePage);
    if (!el) return;
    programmaticUntilRef.current = Date.now() + 1000;
    el.scrollIntoView({ block: "start", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage]);

  // While a stream is in flight, show the accumulating text as a single
  // block — page anchors haven't been written to the DB yet.
  if (streaming) {
    return (
      <div className="h-full overflow-y-auto p-3">
        <div className="border border-primary/40 bg-primary/5 rounded-md p-3">
          <div className="flex items-center gap-1.5 mb-2 text-[10px] text-primary">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="font-mono font-semibold">Streaming…</span>
            {streamingText && streamingText.length > 0 && (
              <span className="ml-auto font-mono text-muted-foreground">
                {streamingText.length.toLocaleString()} chars
              </span>
            )}
          </div>
          {streamingText && streamingText.length > 0 ? (
            // Live AI output → canonical engine (markdown + collapsed ThinkingTrace).
            <PdfAiContent content={streamingText} isStreaming />
          ) : (
            <span className="italic text-[12px] text-muted-foreground">
              Waiting for the model…
            </span>
          )}
        </div>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="h-full overflow-y-auto p-3">
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-md p-3 mb-3 text-[11px] text-amber-700 dark:text-amber-400">
          No per-page rows yet. Open the inspector and run the pipeline.
        </div>
        {field === "cleaned" && fallbackText ? (
          <PdfAiContent content={fallbackText} />
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/85">
            {fallbackText || "(no extracted text)"}
          </pre>
        )}
      </div>
    );
  }

  // Per-page rows exist but the active field is empty across all of them.
  // Render the aggregate as a single block — same rule as desktop, same
  // rationale (AI Clean writes only the aggregate column).
  if (allEmpty) {
    return (
      <div className="h-full overflow-y-auto p-3">
        <div className="border border-border bg-card rounded-md p-3">
          <div className="text-[10px] font-mono font-semibold text-muted-foreground mb-1.5">
            Document text (aggregate) ·{" "}
            {(fallbackText ?? "").length.toLocaleString()} chars
          </div>
          {field === "cleaned" && fallbackText ? (
            <PdfAiContent content={fallbackText} />
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-foreground/85">
              {fallbackText || "(no extracted text)"}
            </pre>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto p-3 space-y-3">
      {pages.map((p) => {
        const text = field === "cleaned" ? p.cleanedText : p.rawText;
        return (
          <div
            key={p.id}
            data-page={p.pageNumber}
            ref={(el) => {
              if (el) anchorMap.current.set(p.pageNumber, el);
              else anchorMap.current.delete(p.pageNumber);
            }}
            className="border border-border rounded-md bg-card p-2.5"
          >
            <div className="text-[10px] font-mono font-semibold text-muted-foreground mb-1">
              page {p.pageNumber}
            </div>
            <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-foreground/85">
              {text || (
                <span className="italic text-muted-foreground">
                  (no text on this page)
                </span>
              )}
            </pre>
          </div>
        );
      })}
    </div>
  );
}
