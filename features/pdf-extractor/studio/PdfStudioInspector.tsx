"use client";

/**
 * PdfStudioInspector — right rail of the desktop studio.
 *
 * Composes the existing per-document panels (lineage, AI actions, data
 * stores, manipulation, AI clean) into a vertically scrolling inspector
 * with a sticky section nav. Designed for the "manage one doc deeply"
 * mode — left rail handles "switch between docs", center handles "read
 * a doc", inspector handles "do something with a doc".
 */

import React, { useEffect, useState } from "react";
import {
  Rocket,
  GitBranch,
  Zap,
  Database,
  Wrench,
  FileText,
  BookOpen,
  Layers,
  MousePointerClick,
  Repeat,
  MessageCircleQuestion,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { ChunkingConfigForm } from "@/features/page-extraction/components/ChunkingConfigForm";
import { cn } from "@/lib/utils";
import type { PdfDocument } from "../hooks/usePdfExtractor";
import type { PdfPageRow } from "../hooks/useProcessedDocumentPages";
import type { PdfPaneEditMode } from "./PdfStudioReader";
import { parsePagesInput } from "@/features/pdf/utils/pages";
import { LineageTreeView } from "../components/LineageTreeView";
import { ManipulationPanel } from "../components/ManipulationPanel";
import { DataStoreBindPanel } from "@/features/rag/components/data-stores/DataStoreBindPanel";
import { createPdfExtractorScope } from "@/features/surfaces/manifests/pdf-extractor.manifest";
import { SurfaceBoundAgentsList } from "@/features/surfaces/components/bind/SurfaceBoundAgentsList";
import { useSurfaceBoundAgents } from "@/features/surfaces/hooks/useSurfaceBoundAgents";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useOpenSurfaceAgentBindWindow } from "@/features/overlays/openers/surfaceAgentBindWindow";

const PDF_EXTRACTOR_SURFACE = "matrx-user/pdf-extractor";

// NOTE: Knowledge Assets is NOT a tab here. A sixth flex-1 tab overflowed this
// narrow right rail (no horizontal scroll). The Knowledge Asset Builder now
// opens as a resizable drawer from the studio toolbar (PdfStudioShell), so the
// doc stays visible while building. See KnowledgeAssetPanel mount sites.
export type SectionKey =
  "widgets" | "chunked" | "stores" | "manipulate" | "lineage";

const SECTIONS: {
  key: SectionKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "widgets", label: "Widgets", icon: Zap },
  { key: "chunked", label: "Chunker", icon: Repeat },
  { key: "stores", label: "Stores", icon: Database },
  { key: "manipulate", label: "Manipulate", icon: Wrench },
  { key: "lineage", label: "Lineage", icon: GitBranch },
];

interface PdfStudioInspectorProps {
  doc: PdfDocument;
  pages: PdfPageRow[];
  activePage: number | null;
  onRunShortcut: (shortcutId: string) => void | Promise<void>;
  onRunPipeline: () => void | Promise<unknown>;
  pipelineRunning: boolean;
  pdfPaneEditMode: PdfPaneEditMode;
  onStartCrop: (pagesInput: string) => void;
  onStartReorder: () => void;
  onEditModeCancel: () => void;
  /** When this changes (e.g. from the Chunks pane CTA), jump to that section. */
  requestedSection?: SectionKey | null;
  onSectionConsumed?: () => void;
}

export function PdfStudioInspector({
  doc,
  pages,
  activePage,
  onRunShortcut,
  onRunPipeline,
  pipelineRunning,
  pdfPaneEditMode,
  onStartCrop,
  onStartReorder,
  onEditModeCancel,
  requestedSection,
  onSectionConsumed,
}: PdfStudioInspectorProps) {
  const [section, setSection] = useState<SectionKey>("widgets");

  useEffect(() => {
    if (requestedSection && requestedSection !== section) {
      setSection(requestedSection);
      onSectionConsumed?.();
    } else if (requestedSection) {
      onSectionConsumed?.();
    }
  }, [requestedSection, section, onSectionConsumed]);

  // Chunked Runs needs a cld_file source. If the doc doesn't have one,
  // the section is still mounted but renders a guidance message.
  const chunkedFileId =
    doc.sourceKind === "cld_file" && doc.sourceId ? doc.sourceId : null;

  return (
    <aside className="flex flex-col h-full min-h-0 border-l border-border bg-card/30">
      {/* Section nav — the canonical studio sub-header row (same px-3 pt-2
          pb-1.5 envelope + pill control as the sidebar's Files/Pages toggle,
          so every column's top row reads at the same size, no lines). */}
      <div className="shrink-0 px-3 pt-2 pb-1.5">
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5 h-7 text-[10px]">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSection(s.key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 h-6 rounded-md px-1.5 transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                title={s.label}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden xl:inline">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content — chunked tab owns its own scroll shell (long variable-
          wiring forms); other sections scroll here. */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {section === "chunked" ? (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {chunkedFileId ? (
              <ChunkingConfigForm
                fileId={chunkedFileId}
                processedDocumentId={doc.id}
                documentName={doc.name}
              />
            ) : (
              <p className="p-3 text-[11px] text-amber-700 dark:text-amber-400 leading-snug overflow-y-auto">
                Chunked extractions need a <code>cld_file</code> source. This
                document doesn&apos;t have one linked.
              </p>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {section === "widgets" && (
              <AiActionsPanel
                doc={doc}
                pages={pages}
                activePage={activePage}
                onRunShortcut={onRunShortcut}
              />
            )}
            {section === "stores" && (
              <DataStoreBindPanel
                processedDocumentId={doc.id}
                documentName={doc.name}
              />
            )}
            {section === "manipulate" && (
              <ManipulationPanel
                doc={doc}
                onRunPipeline={onRunPipeline}
                running={pipelineRunning}
                pdfPaneEditMode={pdfPaneEditMode}
                onStartCrop={onStartCrop}
                onStartReorder={onStartReorder}
                onEditModeCancel={onEditModeCancel}
              />
            )}
            {section === "lineage" && <LineageTreeView doc={doc} />}
          </div>
        )}
      </div>
    </aside>
  );
}

// ── AI Actions panel (surface-bound agents for pdf-extractor) ───────────────

import { useToastManager } from "@/hooks/useToastManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AgentScope = "full" | "current" | "range" | "selection";

/** Design's Ask-tab suggestion grid — generic, doc-type-agnostic prompts. */
const SUGGESTED_QUESTIONS = [
  "Summarize this document",
  "What are the key facts and figures?",
  "What dates or deadlines appear?",
  "Who are the parties involved?",
] as const;

const SCOPE_OPTIONS: {
  key: AgentScope;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
}[] = [
  {
    key: "full",
    label: "Full doc",
    icon: BookOpen,
    hint: "Send entire document text",
  },
  {
    key: "current",
    label: "Current page",
    icon: FileText,
    hint: "Active page only",
  },
  { key: "range", label: "Page range", icon: Layers, hint: "e.g. 1, 3-5" },
  {
    key: "selection",
    label: "Selected text",
    icon: MousePointerClick,
    hint: "Browser text selection",
  },
];

function AiActionsPanel({
  doc,
  pages,
  activePage,
}: {
  doc: PdfDocument;
  pages: PdfPageRow[];
  activePage: number | null;
  onRunShortcut?: (shortcutId: string) => void | Promise<void>;
}) {
  const { launchAgent } = useAgentLauncher();
  const openBind = useOpenSurfaceAgentBindWindow();
  const toast = useToastManager("pdf-extractor");
  const [scope, setScope] = useState<AgentScope>("full");
  const [rangeInput, setRangeInput] = useState("");

  const { sections: boundSections, refresh: refreshBoundAgents } =
    useSurfaceBoundAgents(PDF_EXTRACTOR_SURFACE, {
      isEditable: false,
      includeDefaults: true,
    });

  useEffect(() => {
    void refreshBoundAgents();
  }, [refreshBoundAgents]);

  // First bound agent powers "Ask this document".
  const askAgentId = (() => {
    for (const s of boundSections) {
      if (s.agents[0]) return s.agents[0].agentId;
    }
    return null;
  })();

  const fullText = doc.cleanContent ?? doc.content ?? "";
  const usingClean = !!doc.cleanContent;
  const hasContent = !!fullText;

  function getPageText(p: PdfPageRow): string {
    return usingClean ? p.cleanedText || p.rawText : p.rawText;
  }

  const currentPageText = (() => {
    if (activePage == null) return "";
    const p = pages.find((r) => r.pageNumber === activePage);
    return p ? getPageText(p) : "";
  })();

  const pageRangeText = (() => {
    if (!rangeInput.trim()) return "";
    try {
      const nums = new Set(parsePagesInput(rangeInput));
      return pages
        .filter((p) => nums.has(p.pageNumber))
        .map(getPageText)
        .filter(Boolean)
        .join("\n\n---\n\n");
    } catch {
      return "";
    }
  })();

  const pageRangePages = (() => {
    if (!rangeInput.trim()) return "";
    try {
      const nums = parsePagesInput(rangeInput).sort((a, b) => a - b);
      if (nums.length === 0) return "";
      if (nums.length === 1) return String(nums[0]);
      return `${nums[0]}-${nums[nums.length - 1]}`;
    } catch {
      return "";
    }
  })();

  function getActiveScopeText(): string {
    if (scope === "full" || !pages.length) return fullText;
    if (scope === "current") {
      if (!currentPageText) {
        toast.warning("No active page — sending full document");
        return fullText;
      }
      return currentPageText;
    }
    if (scope === "range") {
      if (!rangeInput.trim()) {
        toast.warning("Enter a page range first");
        return fullText;
      }
      if (!pageRangeText) {
        toast.warning("Invalid page range — sending full document");
        return fullText;
      }
      return pageRangeText;
    }
    if (scope === "selection") {
      const sel = window.getSelection()?.toString().trim() ?? "";
      if (!sel) {
        toast.warning("No text selected — sending full document");
        return fullText;
      }
      return sel;
    }
    return fullText;
  }

  const scopedPreviewLen = (() => {
    if (scope === "full") return fullText.length;
    if (scope === "current" && currentPageText) return currentPageText.length;
    if (scope === "range" && pageRangeText) return pageRangeText.length;
    return null;
  })();

  const buildApplicationScope = () => {
    const browserSelection = window.getSelection()?.toString().trim() ?? "";
    const activeScopeText = getActiveScopeText();
    const pageNumbers = (() => {
      if (scope === "full") {
        if (pages.length === 0) return "";
        if (pages.length === 1) return String(pages[0].pageNumber);
        return `${pages[0].pageNumber}-${pages[pages.length - 1].pageNumber}`;
      }
      if (scope === "current" && activePage != null) return String(activePage);
      if (scope === "range") return pageRangePages;
      return "";
    })();

    const fileId =
      doc.sourceKind === "cld_file" && doc.sourceId ? doc.sourceId : "";

    return createPdfExtractorScope({
      full_document_text: fullText,
      current_page_text: currentPageText,
      page_range_text: pageRangeText,
      selected_text: browserSelection,
      active_scope_text: activeScopeText,
      filename: doc.name,
      file_id: fileId,
      source_missing: doc.sourceMissing === true,
      processed_document_id: doc.id,
      total_pages: pages.length || doc.totalPages || 0,
      current_page: activePage ?? 0,
      page_numbers: pageNumbers || undefined,
      scope_kind: scope,
      using_clean_text: usingClean,
      selection: activeScopeText,
      content: fullText,
    });
  };

  const handleRunAgent = async (agentId: string, userInput?: string) => {
    if (!hasContent) {
      toast.error("Nothing to send to the agent yet");
      return;
    }

    try {
      await launchAgent(agentId, {
        surfaceKey: `pdf-extractor:bound-agent:${agentId}`,
        sourceFeature: "pdf-extractor",
        config: {
          displayMode: "flexible-panel",
          allowChat: true,
          showVariablePanel: true,
        },
        runtime: {
          applicationScope: buildApplicationScope(),
          surfaceName: PDF_EXTRACTOR_SURFACE,
          ...(userInput ? { userInput } : {}),
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not run agent");
    }
  };

  const handleAddAgent = () => {
    openBind({
      surfaceName: PDF_EXTRACTOR_SURFACE,
      surfaceLabel: "PDF Extractor",
      onBound: () => {
        void refreshBoundAgents();
      },
    });
  };

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const ask = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || asking) return;
    if (!askAgentId) {
      toast.error("Add an agent to this surface first");
      handleAddAgent();
      return;
    }
    setAsking(true);
    try {
      await handleRunAgent(askAgentId, trimmed);
      setQuestion("");
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-1.5">
        <Rocket className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
          Run an Agent
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {usingClean ? "AI-cleaned" : "Raw"} ·{" "}
          {fullText.length.toLocaleString()} chars
        </span>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Scope
        </p>
        <div className="grid grid-cols-2 gap-1">
          {SCOPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = scope === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                title={opt.hint}
                onClick={() => setScope(opt.key)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-[10px] transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {scope === "range" && (
          <Input
            value={rangeInput}
            onChange={(e) => setRangeInput(e.target.value)}
            placeholder="e.g. 1, 3-5, 10"
            className="h-7 text-[11px]"
          />
        )}

        {scope === "current" && activePage != null && (
          <p className="text-[10px] text-muted-foreground">
            Active page:{" "}
            <span className="font-mono font-medium text-foreground">
              {activePage}
            </span>
            {scopedPreviewLen != null && (
              <> · {scopedPreviewLen.toLocaleString()} chars</>
            )}
          </p>
        )}

        {scope === "selection" && (
          <p className="text-[10px] text-muted-foreground leading-snug">
            Highlight text in either content pane, then click Run.
          </p>
        )}
      </div>

      {!hasContent && (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No extracted content — run the pipeline first.
        </p>
      )}

      {hasContent && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <MessageCircleQuestion className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
              Ask this document
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void ask(question);
              }}
              placeholder="Ask about this document…"
              className="h-8 text-[11px]"
              disabled={asking}
            />
            <Button
              size="sm"
              className="h-8 px-2.5 shrink-0"
              disabled={!question.trim() || asking}
              onClick={() => void ask(question)}
              aria-label="Ask"
            >
              {asking ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={asking}
                onClick={() => void ask(q)}
                className="rounded-md border border-border bg-card px-2 py-1.5 text-left text-[10px] leading-snug text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">
            Answers are grounded in the {usingClean ? "cleaned" : "extracted"}{" "}
            text of this document.
          </p>
        </div>
      )}

      {hasContent && (
        <SurfaceBoundAgentsList
          surfaceName={PDF_EXTRACTOR_SURFACE}
          surfaceLabel="PDF Extractor"
          onRunAgent={(agentId) => handleRunAgent(agentId)}
          runDisabled={!hasContent}
        />
      )}
    </div>
  );
}

// Chunked-mode UI now lives in
// features/page-extraction/components/ChunkingConfigForm.tsx —
// mounted by the inspector under the dedicated "Chunked Runs" tab.
