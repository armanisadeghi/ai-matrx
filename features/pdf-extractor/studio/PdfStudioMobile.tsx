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
  Lightbulb,
  Layers,
  MoreVertical,
  X,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { usePdfExtractor, type PdfDocument } from "../hooks/usePdfExtractor";
import { useProcessedDocumentPages } from "../hooks/useProcessedDocumentPages";
import { usePdfStudioDocs } from "./hooks/usePdfStudioDocs";
import { PdfStudioSidebar } from "./PdfStudioSidebar";
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
  const extractor = usePdfExtractor();
  const triggerShortcut = useShortcutTrigger();
  const toast = useToastManager("pdf-extractor");

  const [activeDoc, setActiveDoc] = useState<PdfDocument | null>(null);
  const [tab, setTab] = useState<MobileTab>("clean");
  const [activePage, setActivePage] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<"none" | "docs" | "inspector">(
    initialDocumentId ? "none" : "docs",
  );
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);

  const { pages } = useProcessedDocumentPages({
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
    try {
      let openTab = extractor.tabs.find((t) => t.id === activeDoc.id);
      if (!openTab) extractor.openDocument(activeDoc);
      await extractor.runFullPipeline(activeDoc.id, { persist_output: true });
      docsState.refresh();
      toast.success("Pipeline run complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pipeline failed");
    } finally {
      setPipelineRunning(false);
    }
  }, [activeDoc, extractor, docsState, toast]);

  const handleRunShortcut = useCallback(
    async (shortcutId: string) => {
      if (!activeDoc) return;
      const docText = activeDoc.cleanContent ?? activeDoc.content ?? "";
      if (!docText) return;
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

  const total = activeDoc?.totalPages ?? pages.length;

  return (
    <div className="flex flex-col h-[calc(100dvh-2.5rem)] min-h-0 bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card/40 px-2 py-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDrawer("docs")}
          className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
          title="Documents"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          {activeDoc ? (
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{activeDoc.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {(activeDoc.totalPages ?? pages.length).toLocaleString()} pages
                · {activeDoc.derivationKind}
              </p>
            </div>
          ) : (
            <p className="text-xs font-semibold text-muted-foreground">
              PDF Studio
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
          title="Add documents"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setDrawer("inspector")}
          disabled={!activeDoc}
          className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground disabled:opacity-50"
          title="Inspector"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </header>

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
          activeDoc.source ? (
            <iframe
              src={`${activeDoc.source}#page=${activePage ?? 1}`}
              title={activeDoc.name}
              className="w-full h-full bg-background"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              No source URL.
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
          />
        )}
      </div>

      {/* Bottom pager — pb-safe respects iOS home indicator */}
      {activeDoc && total > 0 && (
        <div className="shrink-0 border-t border-border bg-card/60 px-2 py-1.5 pb-safe flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              activePage && setActivePage(Math.max(1, activePage - 1))
            }
            disabled={!activePage || activePage <= 1}
            className="h-9 w-9 rounded-md border border-border bg-background hover:bg-accent disabled:opacity-50 flex items-center justify-center"
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
            onClick={() =>
              activePage && setActivePage(Math.min(total, activePage + 1))
            }
            disabled={!activePage || activePage >= total}
            className="h-9 w-9 rounded-md border border-border bg-background hover:bg-accent disabled:opacity-50 flex items-center justify-center"
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
        <DrawerContent className="h-[85vh]">
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
                onAddDocs={() => {
                  setDrawer("none");
                  setUploadOpen(true);
                }}
                view="files"
                onChangeView={() => {}}
                pages={pages}
                pagesLoading={false}
                totalPages={activeDoc?.totalPages ?? pages.length}
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
        <DrawerContent className="h-[85vh]">
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
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const anchorMap = React.useRef<Map<number, HTMLElement>>(new Map());

  // IO observer so the bottom pager reflects the most-visible page.
  React.useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const page = Number(visible.target.getAttribute("data-page") ?? 0);
        if (page) onActivePage(page);
      },
      { root, threshold: [0.4] },
    );
    anchorMap.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pages.length, onActivePage]);

  // Programmatic scroll on activePage change (driven by bottom pager).
  React.useEffect(() => {
    if (activePage == null) return;
    const el = anchorMap.current.get(activePage);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage]);

  if (pages.length === 0) {
    return (
      <div className="h-full overflow-y-auto p-3">
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-md p-3 mb-3 text-[11px] text-amber-700 dark:text-amber-400">
          No per-page rows yet. Open the inspector and run the pipeline.
        </div>
        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/85">
          {fallbackText || "(no extracted text)"}
        </pre>
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
