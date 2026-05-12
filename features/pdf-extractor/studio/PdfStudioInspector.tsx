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

import React, { useState } from "react";
import {
  Rocket,
  GitBranch,
  Wand2,
  Database,
  Wrench,
  SquareStack,
  FileText,
  BookOpen,
  Layers,
  MousePointerClick,
  Repeat,
} from "lucide-react";
import { ChunkingConfigForm } from "@/features/page-extraction/components/ChunkingConfigForm";
import { cn } from "@/lib/utils";
import type { PdfDocument } from "../hooks/usePdfExtractor";
import type { PdfPageRow } from "../hooks/useProcessedDocumentPages";
import type { PdfPaneEditMode } from "./PdfStudioReader";
import { parsePagesInput } from "@/features/pdf-demo/utils/pages";
import { LineageTreeView } from "../components/LineageTreeView";
import { ManipulationPanel } from "../components/ManipulationPanel";
import { DataStoreBindPanel } from "@/features/rag/components/data-stores/DataStoreBindPanel";

type SectionKey =
  | "widgets"
  | "chunked"
  | "stores"
  | "manipulate"
  | "lineage";

const SECTIONS: {
  key: SectionKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "widgets", label: "Widgets", icon: Wand2 },
  { key: "chunked", label: "Chunked Runs", icon: Repeat },
  { key: "stores", label: "Data Stores", icon: Database },
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
}: PdfStudioInspectorProps) {
  const [section, setSection] = useState<SectionKey>("widgets");

  // Chunked Runs needs a cld_file source. If the doc doesn't have one,
  // the section is still mounted but renders a guidance message.
  const chunkedFileId =
    doc.sourceKind === "cld_file" && doc.sourceId ? doc.sourceId : null;

  return (
    <aside className="flex flex-col h-full min-h-0 border-l border-border bg-card/30">
      {/* Sticky section nav */}
      <div className="shrink-0 border-b border-border">
        <div className="flex items-center gap-0.5 px-2 py-1.5">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSection(s.key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 h-7 rounded-md px-1.5 text-[10px] font-medium transition-colors",
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

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {section === "widgets" && (
          <AiActionsPanel
            doc={doc}
            pages={pages}
            activePage={activePage}
            onRunShortcut={onRunShortcut}
          />
        )}
        {section === "chunked" && (
          <div className="p-3">
            {chunkedFileId ? (
              <ChunkingConfigForm
                fileId={chunkedFileId}
                processedDocumentId={doc.id}
                documentName={doc.name}
              />
            ) : (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                Chunked extractions need a <code>cld_file</code> source.
                This document doesn&apos;t have one linked.
              </p>
            )}
          </div>
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
    </aside>
  );
}

// ── AI Actions panel (inspector-flavoured, shortcut registry) ─────────────

import { useShortcutTrigger } from "@/features/agents/hooks/useShortcutTrigger";
import { useToastManager } from "@/hooks/useToastManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AgentScope = "full" | "current" | "range" | "selection";

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
      "Floating-window agent — reads selected scope, full doc available as context.",
  },
  {
    id: "b967ddc1-7c00-4ccd-af89-26b5c0c7968d",
    label: "WC Extractor",
    description: "Extract Workers Compensation data from the document",
  },
];

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
  onRunShortcut,
}: {
  doc: PdfDocument;
  pages: PdfPageRow[];
  activePage: number | null;
  onRunShortcut: (shortcutId: string) => void | Promise<void>;
}) {
  const trigger = useShortcutTrigger();
  const toast = useToastManager("pdf-extractor");
  const [scope, setScope] = useState<AgentScope>("full");
  const [rangeInput, setRangeInput] = useState("");

  const fullText = doc.cleanContent ?? doc.content ?? "";
  const usingClean = !!doc.cleanContent;
  const hasContent = !!fullText;

  function getPageText(p: PdfPageRow): string {
    return usingClean ? p.cleanedText || p.rawText : p.rawText;
  }

  function getScopedText(): string {
    if (scope === "full" || !pages.length) return fullText;

    if (scope === "current") {
      if (activePage == null) {
        toast.warning("No active page — sending full document");
        return fullText;
      }
      const p = pages.find((r) => r.pageNumber === activePage);
      return p ? getPageText(p) : fullText;
    }

    if (scope === "range") {
      if (!rangeInput.trim()) {
        toast.warning("Enter a page range first");
        return fullText;
      }
      try {
        const nums = new Set(parsePagesInput(rangeInput));
        const joined = pages
          .filter((p) => nums.has(p.pageNumber))
          .map(getPageText)
          .filter(Boolean)
          .join("\n\n---\n\n");
        return joined || fullText;
      } catch {
        toast.warning("Invalid page range — sending full document");
        return fullText;
      }
    }

    if (scope === "selection") {
      const sel = window.getSelection()?.toString().trim();
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
    if (scope === "current" && activePage != null) {
      const p = pages.find((r) => r.pageNumber === activePage);
      return p ? getPageText(p).length : fullText.length;
    }
    return null;
  })();

  const handleRun = async (shortcutId: string) => {
    if (!hasContent) {
      toast.error("Nothing to send to the agent yet");
      return;
    }
    const selection = getScopedText();
    const content = scope !== "full" ? fullText : undefined;
    try {
      await trigger(shortcutId, {
        scope: {
          selection,
          ...(content ? { content } : {}),
        },
        sourceFeature: "programmatic",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not run agent");
    }
  };

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
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

      {/* Scope picker */}
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

        {scope !== "full" && (
          <p className="text-[10px] text-muted-foreground/70 leading-snug">
            Scoped text → <code>selection</code>. Full doc stays in{" "}
            <code>content</code>.
          </p>
        )}
      </div>

      {!hasContent && (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No extracted content — run the pipeline first.
        </p>
      )}

      {/* Widget list — single-shot scopes use the shortcut registry.
          Chunked runs now live in their own inspector tab. */}
      {hasContent && (
        <div className="space-y-1.5">
          {PDF_SHORTCUTS.map((s) => (
            <div
              key={s.id}
              className="flex items-start gap-2 px-2.5 py-2 bg-card border border-border rounded-md"
            >
              <div className="shrink-0 w-6 h-6 rounded bg-primary/10 flex items-center justify-center mt-0.5">
                <SquareStack className="w-3 h-3 text-primary" />
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
                onClick={() => void handleRun(s.id)}
              >
                Run
              </Button>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

// Chunked-mode UI now lives in
// features/page-extraction/components/ChunkingConfigForm.tsx —
// mounted by the inspector under the dedicated "Chunked Runs" tab.
