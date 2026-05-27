"use client";

/**
 * @registry-status: sub-component
 * Body of `pdfExtractorWindow`. Exported as `PdfExtractorFloatingWorkspace`
 * and consumed by the registered shell at
 * features/window-panels/windows/PdfExtractorWindow.tsx. Do NOT register
 * separately — covered by `pdfExtractorWindow`.
 */

import React, { useCallback, useState, useMemo } from "react";
import {
  Upload,
  Loader2,
  FileText,
  X,
  CheckCircle,
  AlertCircle,
  Clock,
  Hash,
  Copy,
  Check,
  FileSearch,
  Trash2,
  Cable,
  Eye,
  Plus,
  StickyNote,
  ExternalLink,
  Zap,
  RefreshCw,
  ClipboardList
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
// Legacy openFilePreview removed in Phase 11 — we just open the source URL
// in a new tab now (signed / share URLs are browser-loadable directly).
import { useAppDispatch } from "@/lib/redux/hooks";
import { useShortcutTrigger } from "@/features/agents/hooks/useShortcutTrigger";
import { useToastManager } from "@/hooks/useToastManager";
import { GitBranch, Wrench, Columns2, Database } from "lucide-react";
import {
  usePdfExtractor,
  type PdfDocument,
  type ExtractionTab,
  type ActiveTabId,
} from "../hooks/usePdfExtractor";
import { SyncedPdfTextView } from "./SyncedPdfTextView";
import { LineageTreeView } from "./LineageTreeView";
import { ManipulationPanel } from "./ManipulationPanel";
import { DataStoreBindPanel } from "@/features/rag/components/data-stores/DataStoreBindPanel";
import { useProcessedDocumentPages } from "../hooks/useProcessedDocumentPages";
import { CopyPagesOverlay } from "./CopyPagesOverlay";

// ─── Sub-tab type for per-extraction view ────────────────────────────────────

type ContentSubTab =
  | "text"
  | "preview"
  | "synced"
  | "metadata"
  | "clean"
  | "ai"
  | "manipulate"
  | "stores"
  | "lineage";

// ─── Shortcut registry ───────────────────────────────────────────────────────
// Shortcuts available from the PDF Workspace. Each one is triggered with the
// document text bound to `selection` (most shortcut authors map this to their
// agent's primary input variable). Add more entries here to expose them.

interface PdfShortcutEntry {
  id: string;
  label: string;
  description: string;
}

const PDF_SHORTCUTS: PdfShortcutEntry[] = [
  {
    id: "dba439a3-a495-4e57-893a-2176cf14ab8d",
    label: "Analyze Document",
    description:
      "Run analysis in a floating window — uses cleaned content when available, otherwise the raw extraction.",
  },
];

// Above this character count we open Save to Notes in `plain` editor mode so
// the markdown preview pane doesn't try to render the full extraction at once.
const PLAIN_SAVE_THRESHOLD = 30_000;

// ─── PdfExtractorFloatingWorkspace ───────────────────────────────────────────

export function PdfExtractorFloatingWorkspace({
  onClose,
  initialDocumentId,
}: {
  onClose: () => void;
  /**
   * Open this doc as soon as the workspace mounts. Used by the deep-link
   * route at `/tools/pdf-extractor/[id]`. The fetch goes through the
   * normal lazy path (`fetchDocument` → `openDocument`).
   */
  initialDocumentId?: string;
}) {
  const extractor = usePdfExtractor();
  const dispatch = useAppDispatch();
  const triggerShortcut = useShortcutTrigger();
  const toast = useToastManager("pdf-extractor");

  // Open `initialDocumentId` once on mount. Goes through the lazy-fetch
  // path so the per-tab loading spinner shows correctly.
  React.useEffect(() => {
    if (!initialDocumentId) return;
    let cancelled = false;
    (async () => {
      const full = await extractor.fetchDocument(initialDocumentId);
      if (cancelled || !full) return;
      extractor.openDocument(full);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only on mount + when the requested id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocumentId]);

  const activeTab = extractor.activeTab;

  // Best text to feed an agent — prefer the AI-cleaned output if it exists.
  const docText = useMemo(() => {
    const doc = activeTab?.document;
    if (!doc) return "";
    return doc.cleanContent ?? doc.content ?? "";
  }, [activeTab]);

  // ── Footer actions ──────────────────────────────────────────────────────

  const handleSaveToNotes = useCallback(() => {
    const doc = activeTab?.document;
    const text = doc?.content;
    if (!text) return;
    dispatch(
      openOverlay({
        overlayId: "saveToNotes",
        // Per-doc instance so two concurrent extractions don't overwrite
        // each other's draft via the shared singleton "default" slot.
        instanceId: doc?.id
          ? `save-notes-pdf-${doc.id}`
          : `save-notes-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        data: {
          initialContent: text,
          defaultFolder: "Scratch",
          // Large extractions can stall the markdown preview pane on open.
          // Force the plain editor for big payloads — users can still toggle
          // back to split/preview from the toolbar once it's mounted.
          initialEditorMode:
            text.length > PLAIN_SAVE_THRESHOLD ? "plain" : undefined,
        },
      }),
    );
  }, [dispatch, activeTab]);

  const handleViewOriginal = useCallback(() => {
    const doc = activeTab?.document;
    if (!doc?.source) return;
    // The source URL is a share URL or public S3 URL; open it in a new tab
    // rather than reproducing the legacy floating preview window.
    if (typeof window !== "undefined") {
      window.open(doc.source, "_blank", "noopener,noreferrer");
    }
  }, [activeTab]);

  const handleRunShortcut = useCallback(
    async (shortcutId: string) => {
      if (!docText) {
        toast.error("Nothing to send to the agent yet");
        return;
      }
      try {
        await triggerShortcut(shortcutId, {
          scope: { selection: docText },
          sourceFeature: "programmatic",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not run agent";
        toast.error(msg);
      }
    },
    [docText, triggerShortcut, toast],
  );

  const defaultShortcut = PDF_SHORTCUTS[0];

  const footer = useMemo(() => {
    if (extractor.activeTabId === "new") {
      return (
        <span className="text-[10px] text-muted-foreground">
          Supports PDF, PNG, JPG, WEBP
        </span>
      );
    }

    if (!activeTab?.document) return null;

    return (
      <>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {activeTab.document.source && (
            <FooterButton
              icon={<Eye className="w-2.5 h-2.5" />}
              label="View Original"
              onClick={handleViewOriginal}
            />
          )}
          {defaultShortcut && activeTab.document.content && (
            <FooterButton
              icon={<Zap className="w-2.5 h-2.5" />}
              label={defaultShortcut.label}
              onClick={() => handleRunShortcut(defaultShortcut.id)}
            />
          )}
          <FooterButton
            icon={<StickyNote className="w-2.5 h-2.5" />}
            label="Save to Notes"
            onClick={handleSaveToNotes}
          />
          {activeTab.document.content && (
            <CopyFooterButton onCopy={() => extractor.copyText(activeTab.id)} />
          )}
        </div>
      </>
    );
  }, [
    extractor.activeTabId,
    activeTab,
    handleViewOriginal,
    handleSaveToNotes,
    handleRunShortcut,
    defaultShortcut,
    extractor,
  ]);

  return (
    <WindowPanel
      id="pdf-extractor"
      title="PDF Extractor"
      onClose={onClose}
      width={740}
      height={580}
      minWidth={460}
      minHeight={340}
      position="center"
      overlayId="pdfExtractorWindow"
      onCollectData={() => ({ history: extractor.history, currentIndex: null })}
      sidebar={
        <PdfExtractorSidebar
          history={extractor.history}
          historyLoading={extractor.historyLoading}
          openTabIds={extractor.openTabIds}
          activeTabId={extractor.activeTabId}
          onSelect={extractor.openDocument}
          onRefresh={extractor.loadHistory}
        />
      }
      sidebarDefaultSize={200}
      sidebarMinSize={150}
      defaultSidebarOpen={true}
      sidebarClassName="bg-muted/10"
      urlSyncKey="pdf_extractor"
      urlSyncId="default"
      footer={footer}
    >
      <PdfExtractorWindowContent
        extractor={extractor}
        onRunShortcut={handleRunShortcut}
      />
    </WindowPanel>
  );
}

// ─── Main Content ────────────────────────────────────────────────────────────

function PdfExtractorWindowContent({
  extractor,
  onRunShortcut,
}: {
  extractor: ReturnType<typeof usePdfExtractor>;
  onRunShortcut: (shortcutId: string) => void | Promise<void>;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Tab Bar ─────────────────────────────────────────────── */}
      <ExtractionTabBar
        tabs={extractor.tabs}
        activeTabId={extractor.activeTabId}
        onSelectTab={extractor.setActiveTabId}
        onCloseTab={extractor.closeTab}
      />

      {/* ── Tab Content ─────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {extractor.activeTabId === "new" ? (
          <NewExtractionContent extractor={extractor} />
        ) : extractor.activeTab ? (
          <ExtractionTabContent
            tab={extractor.activeTab}
            onClean={extractor.cleanContent}
            onRefresh={extractor.refreshDocument}
            onRunPipeline={extractor.runFullPipeline}
            onRunShortcut={onRunShortcut}
          />
        ) : (
          <EmptyState message="Select a tab or start a new extraction" />
        )}
      </div>
    </div>
  );
}

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

function ExtractionTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
}: {
  tabs: ExtractionTab[];
  activeTabId: ActiveTabId;
  onSelectTab: (id: ActiveTabId) => void;
  onCloseTab: (id: string) => void;
}) {
  return (
    <div className="shrink-0 flex items-center gap-0 px-1 border-b border-border overflow-x-auto scrollbar-none">
      {/* Permanent "New" tab */}
      <button
        type="button"
        onClick={() => onSelectTab("new")}
        className={cn(
          "flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border-b-2 transition-colors shrink-0",
          activeTabId === "new"
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        <Plus className="w-3 h-3" />
        New
      </button>

      {/* Per-extraction tabs */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "group flex items-center gap-1 px-2 py-1.5 border-b-2 transition-colors shrink-0 max-w-[160px]",
            activeTabId === tab.id
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <button
            type="button"
            onClick={() => onSelectTab(tab.id)}
            className="flex items-center gap-1 min-w-0 flex-1"
          >
            {tab.status === "extracting" ||
            tab.status === "cleaning" ||
            tab.status === "loading" ? (
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            ) : tab.status === "error" ? (
              <AlertCircle className="w-3 h-3 text-destructive shrink-0" />
            ) : (
              <FileText className="w-3 h-3 shrink-0" />
            )}
            <span className="text-[11px] font-medium truncate">
              {tab.filename}
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-all shrink-0"
            aria-label={`Close ${tab.filename}`}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── "New Extraction" Tab Content ────────────────────────────────────────────

function NewExtractionContent({
  extractor,
}: {
  extractor: ReturnType<typeof usePdfExtractor>;
}) {
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) extractor.addFiles(files);
      // Reset so the same files can be re-selected
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

  const isExtracting = extractor.batchStatus === "extracting";

  return (
    <div className="flex flex-col h-full min-h-0">
      <input
        ref={extractor.fileInputRef}
        type="file"
        accept=".pdf,image/*"
        multiple
        onChange={handleFileInputChange}
        disabled={isExtracting}
        className="hidden"
      />

      {/* ── Selected files list ──────────────────────────────────── */}
      {extractor.selectedFiles.length > 0 ? (
        <div className="shrink-0 px-3 pt-2.5 pb-2 space-y-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
              {extractor.selectedFiles.length} file
              {extractor.selectedFiles.length !== 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => extractor.fileInputRef.current?.click()}
                disabled={isExtracting}
                className="px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border rounded hover:bg-accent transition-colors disabled:opacity-50"
              >
                Add More
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

          <div className="space-y-0.5 max-h-[200px] overflow-y-auto scrollbar-thin">
            {extractor.selectedFiles.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 border border-border rounded-md"
              >
                <div className="shrink-0 w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
                  <FileText className="w-2.5 h-2.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium truncate leading-tight">
                    {file.name}
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => extractor.removeFile(i)}
                  disabled={isExtracting}
                  className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors rounded disabled:opacity-50"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>

          <Button
            onClick={extractor.extractFiles}
            disabled={isExtracting}
            size="sm"
            className="w-full h-7 text-xs mt-1"
          >
            {isExtracting ? (
              <>
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                Extract{" "}
                {extractor.selectedFiles.length > 1
                  ? `All (${extractor.selectedFiles.length})`
                  : ""}
              </>
            )}
          </Button>
        </div>
      ) : (
        /* ── Drop zone ───────────────────────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <button
            type="button"
            onClick={() => extractor.fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="w-full max-w-sm flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-border rounded-xl hover:border-primary/40 hover:bg-muted/20 transition-colors cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
              <Upload className="w-5 h-5 text-primary/60 group-hover:text-primary transition-colors" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">
                Drop files here or{" "}
                <span className="text-primary underline">browse</span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                PDF, PNG, JPG, WEBP — select multiple files for batch extraction
              </p>
            </div>
          </button>
        </div>
      )}

      {/* ── Extracting progress for batch ────────────────────────── */}
      {isExtracting && extractor.tabs.length > 0 && (
        <div className="shrink-0 px-3 pb-2">
          <div className="space-y-0.5">
            {extractor.tabs
              .filter((t) => t.status === "extracting")
              .map((tab) => (
                <div
                  key={tab.id}
                  className="flex items-center gap-2 px-2 py-1 text-[10px] text-muted-foreground bg-muted/30 rounded"
                >
                  <Loader2 className="w-2.5 h-2.5 animate-spin shrink-0" />
                  <span className="truncate">{tab.filename}</span>
                  {tab.progressMessage && (
                    <span className="text-[9px] text-muted-foreground/60 ml-auto shrink-0">
                      {tab.progressMessage}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Workspace Copy Pages wrapper (lazy page fetch) ──────────────────────────

function WorkspaceCopyPages({
  open,
  onClose,
  doc,
}: {
  open: boolean;
  onClose: () => void;
  doc: PdfDocument;
}) {
  const { pages, loading } = useProcessedDocumentPages({
    processedDocumentId: doc.id,
    enabled: open,
  });
  return (
    <CopyPagesOverlay
      open={open}
      onClose={onClose}
      doc={doc}
      pages={pages}
      pagesLoading={loading}
    />
  );
}

// ─── Per-Extraction Tab Content ──────────────────────────────────────────────

function ExtractionTabContent({
  tab,
  onClean,
  onRefresh,
  onRunPipeline,
  onRunShortcut,
}: {
  tab: ExtractionTab;
  onClean: (docId: string) => Promise<void>;
  onRefresh: (docId: string) => Promise<boolean>;
  // `onRunPipeline` returns `{ success, childDocId }` from `usePdfExtractor`.
  // The legacy workspace doesn't navigate to the child — it stays put and
  // just relies on the in-place refetch — so it discards the result.
  onRunPipeline: (
    docId: string,
    options?: { force_ocr?: boolean; persist_output?: boolean },
  ) => Promise<{ success: boolean; childDocId: string | null }>;
  onRunShortcut: (shortcutId: string) => void | Promise<void>;
}) {
  const [subTab, setSubTab] = useState<ContentSubTab>("text");
  const [copyPagesOpen, setCopyPagesOpen] = useState(false);
  const reprocessing = tab.status === "cleaning";

  if (tab.status === "extracting") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 h-full">
        <Loader2 className="w-6 h-6 text-primary/60 animate-spin" />
        <p className="text-xs text-muted-foreground">
          Extracting {tab.filename}...
        </p>
        {tab.progressMessage && (
          <p className="text-[10px] text-muted-foreground/60">
            {tab.progressMessage}
          </p>
        )}
      </div>
    );
  }

  if (tab.status === "loading") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 h-full">
        <Loader2 className="w-6 h-6 text-primary/60 animate-spin" />
        <p className="text-xs text-muted-foreground">Loading {tab.filename}…</p>
        <p className="text-[10px] text-muted-foreground/60">
          Fetching content from Supabase
        </p>
      </div>
    );
  }

  if (tab.status === "error") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 h-full p-4">
        <AlertCircle className="w-8 h-8 text-destructive/40" />
        <p className="text-sm font-medium text-destructive">
          Could not load this document
        </p>
        <p className="text-xs text-muted-foreground text-center max-w-[280px]">
          {tab.error}
        </p>
      </div>
    );
  }

  if (!tab.document) {
    return <EmptyState message="No document data available" />;
  }

  const doc = tab.document;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Stats row ───────────────────────────────────────────── */}
      <div className="shrink-0 px-3 pt-2 pb-1.5">
        <div className="grid grid-cols-4 gap-1.5">
          <StatChip
            icon={<CheckCircle className="w-3 h-3 text-emerald-500" />}
            label="Status"
            value="Done"
            valueClass="text-emerald-600 dark:text-emerald-400"
          />
          <StatChip
            icon={<Hash className="w-3 h-3 text-muted-foreground" />}
            label="Chars"
            value={doc.charCount.toLocaleString()}
          />
          <StatChip
            icon={<Hash className="w-3 h-3 text-muted-foreground" />}
            label="Words"
            value={doc.wordCount.toLocaleString()}
          />
          <StatChip
            icon={<Clock className="w-3 h-3 text-muted-foreground" />}
            label="Created"
            value={formatRelativeTime(doc.createdAt)}
          />
        </div>
      </div>

      {/* ── Sub-tab strip ───────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-0 px-3 border-b border-border overflow-x-auto scrollbar-none">
        <SubTabBtn
          active={subTab === "text"}
          onClick={() => setSubTab("text")}
          icon={<FileText className="w-3 h-3" />}
          label="Raw Text"
        />
        <SubTabBtn
          active={subTab === "preview"}
          onClick={() => setSubTab("preview")}
          icon={<Eye className="w-3 h-3" />}
          label="Preview"
        />
        <SubTabBtn
          active={subTab === "synced"}
          onClick={() => setSubTab("synced")}
          icon={<Columns2 className="w-3 h-3" />}
          label="Synced View"
        />
        <SubTabBtn
          active={subTab === "metadata"}
          onClick={() => setSubTab("metadata")}
          icon={<FileSearch className="w-3 h-3" />}
          label="Metadata"
        />
        <SubTabBtn
          active={subTab === "clean"}
          onClick={() => setSubTab("clean")}
          icon={<Cable className="w-3 h-3" />}
          label="AI Clean"
          badge={doc.cleanContent ? undefined : undefined}
        />
        <SubTabBtn
          active={subTab === "ai"}
          onClick={() => setSubTab("ai")}
          icon={<Zap className="w-3 h-3" />}
          label="AI Actions"
        />
        <SubTabBtn
          active={subTab === "manipulate"}
          onClick={() => setSubTab("manipulate")}
          icon={<Wrench className="w-3 h-3" />}
          label="Manipulate"
        />
        <SubTabBtn
          active={subTab === "stores"}
          onClick={() => setSubTab("stores")}
          icon={<Database className="w-3 h-3" />}
          label="Data Stores"
        />
        <SubTabBtn
          active={subTab === "lineage"}
          onClick={() => setSubTab("lineage")}
          icon={<GitBranch className="w-3 h-3" />}
          label="Lineage"
        />
        {/* Copy Pages button — always visible when content exists */}
        {doc.content && (
          <button
            type="button"
            onClick={() => setCopyPagesOpen(true)}
            title="Copy page range to clipboard with structured tags"
            className="ml-auto shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ClipboardList className="w-3 h-3" />
            Copy Pages
          </button>
        )}
      </div>

      {/* ── Sub-tab content ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {subTab === "text" && <RawTextView content={doc.content} />}
        {subTab === "preview" && <PreviewView content={doc.content} />}
        {subTab === "synced" && (
          <SyncedPdfTextView
            doc={doc}
            reprocessing={reprocessing}
            onReprocess={() => onRunPipeline(tab.id)}
          />
        )}
        {subTab === "metadata" && <MetadataView doc={doc} />}
        {subTab === "clean" && (
          <AiCleanView tab={tab} onClean={onClean} onRefresh={onRefresh} />
        )}
        {subTab === "ai" && (
          <AiActionsView doc={doc} onRunShortcut={onRunShortcut} />
        )}
        {subTab === "manipulate" && (
          <ManipulationPanel
            doc={doc}
            onRunPipeline={() => onRunPipeline(tab.id)}
            running={reprocessing}
          />
        )}
        {subTab === "stores" && (
          <DataStoreBindPanel
            processedDocumentId={doc.id}
            documentName={doc.name}
          />
        )}
        {subTab === "lineage" && <LineageTreeView doc={doc} />}
      </div>

      {/* Copy Pages overlay — lazy, only fetches page data when open */}
      <WorkspaceCopyPages
        open={copyPagesOpen}
        onClose={() => setCopyPagesOpen(false)}
        doc={doc}
      />
    </div>
  );
}

// ─── AI Actions View ─────────────────────────────────────────────────────────

function AiActionsView({
  doc,
  onRunShortcut,
}: {
  doc: PdfDocument;
  onRunShortcut: (shortcutId: string) => void | Promise<void>;
}) {
  const hasContent = !!(doc.cleanContent ?? doc.content);
  const usingClean = !!doc.cleanContent;
  const charCount = (doc.cleanContent ?? doc.content ?? "").length;

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Zap className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
          Run an Agent
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {usingClean ? "AI-cleaned" : "Raw"} · {charCount.toLocaleString()}{" "}
          chars
        </span>
      </div>

      {!hasContent && (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No extracted content available yet.
        </p>
      )}

      {hasContent && (
        <div className="space-y-1.5">
          {PDF_SHORTCUTS.map((s) => (
            <div
              key={s.id}
              className="flex items-start gap-2 px-2.5 py-2 bg-card border border-border rounded-md"
            >
              <div className="shrink-0 w-6 h-6 rounded bg-primary/10 flex items-center justify-center mt-0.5">
                <Zap className="w-3 h-3 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium leading-tight">{s.label}</p>
                <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                  {s.description}
                </p>
              </div>
              <Button
                size="sm"
                className="h-7 text-[10px] px-2 shrink-0"
                onClick={() => onRunShortcut(s.id)}
              >
                Run
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/70 pt-1 leading-snug">
        Each agent receives the document text as <code>selection</code>. Long
        documents may degrade quality — consider running AI Clean first or
        chunking large files.
      </p>
    </div>
  );
}

// ─── Sub-tab Content Views ───────────────────────────────────────────────────

function RawTextView({ content }: { content: string | null }) {
  if (!content)
    return <EmptyState message="No text extracted from this file" />;
  return (
    <div className="p-3">
      <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed">
        {content}
      </pre>
    </div>
  );
}

function PreviewView({ content }: { content: string | null }) {
  if (!content) return <EmptyState message="No content to preview" />;
  return (
    <div className="p-3">
      <div className="bg-card border border-border rounded-lg p-3">
        <p className="text-xs leading-relaxed text-foreground whitespace-pre-line">
          {content.slice(0, 2000)}
          {content.length > 2000 && (
            <span className="text-muted-foreground">
              {" "}
              ...&nbsp;({(content.length - 2000).toLocaleString()} more chars)
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function MetadataView({ doc }: { doc: PdfDocument }) {
  return (
    <div className="p-3 space-y-1.5">
      <MetaRow label="Filename" value={doc.name} />
      <MetaRow label="Document ID" value={doc.id} mono />
      <MetaRow label="Characters" value={doc.charCount.toLocaleString()} />
      <MetaRow label="Words" value={doc.wordCount.toLocaleString()} />
      <MetaRow
        label="Created"
        value={new Date(doc.createdAt).toLocaleString()}
      />
      <MetaRow
        label="Updated"
        value={new Date(doc.updatedAt).toLocaleString()}
      />
      {doc.source && (
        <div className="flex items-start gap-2 px-2.5 py-1.5 bg-card border border-border rounded-md">
          <span className="text-[10px] font-medium text-muted-foreground shrink-0 w-28">
            Source File
          </span>
          <a
            href={doc.source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-primary hover:underline break-all flex items-center gap-1"
          >
            View in storage
            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
          </a>
        </div>
      )}
      <MetaRow
        label="AI Cleaned"
        value={doc.cleanContent ? "Yes" : "Not yet"}
      />
    </div>
  );
}

function AiCleanView({
  tab,
  onClean,
  onRefresh,
}: {
  tab: ExtractionTab;
  onClean: (docId: string) => Promise<void>;
  onRefresh: (docId: string) => Promise<boolean>;
}) {
  const doc = tab.document;
  if (!doc) return <EmptyState message="No document data" />;

  if (tab.status === "cleaning") {
    // While the stream is in flight, render the live-accumulating
    // `tab.streamingText` in a monospace block — the user can watch the
    // model fill in the cleaned text token-by-token instead of staring at
    // a centered spinner. Falls back to the simple loader until the first
    // delta arrives.
    const hasStreamingText =
      typeof tab.streamingText === "string" && tab.streamingText.length > 0;
    return (
      <div className="flex flex-col h-full min-h-0 p-3 gap-2">
        <div className="shrink-0 flex items-center gap-2 text-[11px] text-primary">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="font-semibold">Cleaning content…</span>
          {tab.progressMessage && (
            <span className="text-muted-foreground truncate">
              {tab.progressMessage}
            </span>
          )}
          {hasStreamingText && (
            <span className="ml-auto font-mono text-muted-foreground">
              {tab.streamingText!.length.toLocaleString()} chars
            </span>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto rounded-md border border-primary/30 bg-primary/5 p-3">
          {hasStreamingText ? (
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/85">
              {tab.streamingText}
            </pre>
          ) : (
            <p className="italic text-xs text-muted-foreground">
              Waiting for the model…
            </p>
          )}
        </div>
      </div>
    );
  }

  if (doc.cleanContent) {
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
            AI Cleaned
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            Source: Python <code>/utilities/pdf/clean-content</code>
          </span>
        </div>
        <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed">
          {doc.cleanContent}
        </pre>
      </div>
    );
  }

  // No clean content. Either the user hasn't run cleanup yet, or the most
  // recent run errored. We never silently refetch — show both controls so the
  // user picks what they want.
  const hasError = !!tab.error;

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center gap-3 h-full">
      <div
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center",
          hasError ? "bg-destructive/10" : "bg-primary/10",
        )}
      >
        {hasError ? (
          <AlertCircle className="w-5 h-5 text-destructive" />
        ) : (
          <Cable className="w-5 h-5 text-primary" />
        )}
      </div>
      <div>
        <p className="text-sm font-medium">
          {hasError ? "AI Cleanup did not return content" : "AI Text Cleanup"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-[280px]">
          {hasError
            ? tab.error
            : "Run an AI agent to clean up extracted text, fix formatting artifacts, and return structured output."}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => onClean(tab.id)}
        >
          <Zap className="w-3 h-3 mr-1.5" />
          {hasError ? "Re-run Cleanup" : "Run AI Cleanup"}
        </Button>
        {hasError && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => void onRefresh(tab.id)}
          >
            <RefreshCw className="w-3 h-3 mr-1.5" />
            Refetch from server
          </Button>
        )}
      </div>
      {hasError && (
        <p className="text-[10px] text-muted-foreground/70 max-w-[280px]">
          Re-run to call <code>/clean-content</code> again. Refetch reloads the
          document row from Supabase — useful if a previous stream wrote
          <code>clean_content</code> but the response was lost.
        </p>
      )}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function PdfExtractorSidebar({
  history,
  historyLoading,
  openTabIds,
  activeTabId,
  onSelect,
  onRefresh,
}: {
  history: PdfDocument[];
  historyLoading: boolean;
  openTabIds: Set<string>;
  activeTabId: ActiveTabId;
  onSelect: (doc: PdfDocument) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-2 py-1.5 border-b border-border flex items-center justify-between shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
          History
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={historyLoading}
          className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors rounded disabled:opacity-50"
          title="Refresh history"
        >
          <RefreshCw
            className={cn("w-3 h-3", historyLoading && "animate-spin")}
          />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-1 space-y-0.5">
        {historyLoading && history.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-4 h-4 text-muted-foreground/40 animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[10px] text-muted-foreground/40 italic text-center px-2">
              Extracted files appear here
            </p>
          </div>
        ) : (
          history.map((doc) => {
            const isOpen = openTabIds.has(doc.id);
            const isActive = activeTabId === doc.id;

            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => onSelect(doc)}
                className={cn(
                  "w-full flex items-start gap-1.5 px-1.5 py-1.5 rounded transition-colors text-left group",
                  isActive
                    ? "bg-accent border-l-2 border-primary"
                    : isOpen
                      ? "bg-muted/40 border-l-2 border-primary/30"
                      : "hover:bg-accent border-l-2 border-transparent",
                )}
              >
                <div
                  className={cn(
                    "shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5",
                    isActive
                      ? "bg-primary/20"
                      : isOpen
                        ? "bg-primary/10"
                        : "bg-primary/10",
                  )}
                >
                  <FileText
                    className={cn(
                      "w-2.5 h-2.5",
                      isActive ? "text-primary" : "text-primary/70",
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-[10px] font-medium truncate leading-tight",
                      isActive
                        ? "text-foreground"
                        : "text-foreground/80 group-hover:text-foreground",
                    )}
                  >
                    {doc.name}
                  </p>
                  <p className="text-[9px] text-muted-foreground/50 leading-tight">
                    {/* Char count omitted for list rows — they're metadata-only
                        on purpose (loading full text for hundreds of docs took 2+ min).
                        Once a doc is opened it's hydrated and the per-tab views show counts. */}
                    {formatRelativeTime(doc.createdAt)}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Shared UI Primitives ────────────────────────────────────────────────────

function FooterButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border border-border bg-background hover:bg-accent text-foreground transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}

function CopyFooterButton({ onCopy }: { onCopy: () => Promise<void> }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [onCopy]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border border-border bg-background hover:bg-accent text-foreground transition-colors"
    >
      {copied ? (
        <>
          <Check className="w-2.5 h-2.5 text-emerald-500" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="w-2.5 h-2.5" />
          Copy Text
        </>
      )}
    </button>
  );
}

function StatChip({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-md px-2 py-1.5">
      <div className="flex items-center gap-1 mb-0.5">
        {icon}
        <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "text-xs font-semibold tabular-nums truncate",
          valueClass,
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SubTabBtn({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium border-b-2 transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
      {badge && (
        <span className="px-1 text-[8px] font-semibold bg-muted text-muted-foreground rounded leading-none py-0.5">
          {badge}
        </span>
      )}
    </button>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 px-2.5 py-1.5 bg-card border border-border rounded-md">
      <span className="text-[10px] font-medium text-muted-foreground shrink-0 w-28">
        {label}
      </span>
      <span
        className={cn(
          "text-[10px] text-foreground/80 break-all",
          mono && "font-mono text-[9px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center h-full">
      <FileSearch className="w-6 h-6 text-muted-foreground/30 mb-1.5" />
      <p className="text-[11px] text-muted-foreground">{message}</p>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
