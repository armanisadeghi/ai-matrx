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
  Wand2,
  Database,
  Wrench,
  SquareStack,
  FileText,
  BookOpen,
  Layers,
  MousePointerClick,
  Repeat,
  Loader2,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useExtractionJobs } from "@/features/page-extraction/hooks/useExtractionJobs";
import { useExtractionStream } from "@/features/page-extraction/hooks/useExtractionStream";
import { selectJobForFile } from "@/features/page-extraction/redux/pageExtractionSlice";
import { selectSelectedJobForFile } from "@/features/page-extraction/redux/selectors";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { PdfDocument } from "../hooks/usePdfExtractor";
import type { PdfPageRow } from "../hooks/useProcessedDocumentPages";
import type { PdfPaneEditMode } from "./PdfStudioReader";
import { parsePagesInput } from "@/features/pdf-demo/utils/pages";
import { LineageTreeView } from "../components/LineageTreeView";
import { ManipulationPanel } from "../components/ManipulationPanel";
import { DataStoreBindPanel } from "@/features/rag/components/data-stores/DataStoreBindPanel";

type SectionKey = "ai" | "stores" | "manipulate" | "lineage";

const SECTIONS: {
  key: SectionKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "ai", label: "AI Actions", icon: Wand2 },
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
  const [section, setSection] = useState<SectionKey>("ai");

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
        {section === "ai" && (
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
    </aside>
  );
}

// ── AI Actions panel (inspector-flavoured, shortcut registry) ─────────────

import { useShortcutTrigger } from "@/features/agents/hooks/useShortcutTrigger";
import { useToastManager } from "@/hooks/useToastManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AgentScope = "full" | "current" | "range" | "selection" | "chunked";

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
  {
    key: "chunked",
    label: "Chunked run",
    icon: Repeat,
    hint: "Fan out across pages, persist per-page results",
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

        {scope === "chunked" && (
          <ChunkedScopeControls
            doc={doc}
            pages={pages}
            rangeInput={rangeInput}
            setRangeInput={setRangeInput}
          />
        )}

        {scope !== "full" && scope !== "chunked" && (
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

      {/* Agent list — single-shot scopes use the shortcut registry */}
      {hasContent && scope !== "chunked" && (
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

      {/* Chunked-run launcher — fans out across pages, persists per-page results */}
      {hasContent && scope === "chunked" && (
        <ChunkedRunLauncher doc={doc} pages={pages} rangeInput={rangeInput} />
      )}
    </div>
  );
}

// ── Chunked-mode helpers ──────────────────────────────────────────────────

function resolveScopePages(
  pages: PdfPageRow[],
  rangeInput: string,
): number[] {
  const all = pages.map((p) => p.pageNumber).sort((a, b) => a - b);
  if (!rangeInput.trim()) return all;
  try {
    const parsed = parsePagesInput(rangeInput);
    const valid = new Set(all);
    return parsed.filter((n) => valid.has(n));
  } catch {
    return all;
  }
}

function ChunkedScopeControls({
  doc,
  pages,
  rangeInput,
  setRangeInput,
}: {
  doc: PdfDocument;
  pages: PdfPageRow[];
  rangeInput: string;
  setRangeInput: (v: string) => void;
}) {
  const scopePages = resolveScopePages(pages, rangeInput);
  const fileId =
    doc.sourceKind === "cld_file" && doc.sourceId ? doc.sourceId : null;
  return (
    <div className="space-y-1.5">
      <Input
        value={rangeInput}
        onChange={(e) => setRangeInput(e.target.value)}
        placeholder="Pages (e.g. 1-50). Empty = all."
        className="h-7 text-[11px]"
      />
      <p className="text-[10px] text-muted-foreground leading-snug">
        Will process <span className="font-mono">{scopePages.length}</span> page
        {scopePages.length === 1 ? "" : "s"} in chunks defined by the selected
        Job. Pick a Job below to start.
      </p>
      {!fileId && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          Chunked extractions require a `cld_file` source. This document
          doesn't have one linked.
        </p>
      )}
    </div>
  );
}

function ChunkedRunLauncher({
  doc,
  pages,
  rangeInput,
}: {
  doc: PdfDocument;
  pages: PdfPageRow[];
  rangeInput: string;
}) {
  const fileId =
    doc.sourceKind === "cld_file" && doc.sourceId ? doc.sourceId : null;
  const dispatch = useAppDispatch();
  const { jobs, loading } = useExtractionJobs(fileId);
  const selectedJobId = useAppSelector((s) =>
    selectSelectedJobForFile(s, fileId),
  );
  const { running, error, start } = useExtractionStream();
  const toast = useToastManager("pdf-extractor");

  // Auto-pick first job once jobs land.
  useEffect(() => {
    if (!fileId || selectedJobId || jobs.length === 0) return;
    dispatch(selectJobForFile({ fileId, jobId: jobs[0].id }));
  }, [fileId, selectedJobId, jobs, dispatch]);

  const handleRun = async () => {
    if (!fileId) {
      toast.error("This doc has no cld_file source.");
      return;
    }
    if (!selectedJobId) {
      toast.error("Pick a Job first.");
      return;
    }
    const scopePages = resolveScopePages(pages, rangeInput);
    if (scopePages.length === 0) {
      toast.error("No pages in scope.");
      return;
    }
    try {
      await start(fileId, {
        job_id: selectedJobId,
        scope_pages: scopePages,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Run failed");
    }
  };

  if (!fileId) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground shrink-0">Job</span>
        <Select
          value={selectedJobId ?? undefined}
          onValueChange={(jobId) =>
            dispatch(selectJobForFile({ fileId, jobId }))
          }
          disabled={loading || jobs.length === 0}
        >
          <SelectTrigger className="h-7 text-[11px]">
            <SelectValue
              placeholder={
                loading
                  ? "Loading jobs…"
                  : jobs.length === 0
                    ? "No jobs yet"
                    : "Pick a job…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {jobs.map((j) => (
              <SelectItem key={j.id} value={j.id}>
                {j.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        size="sm"
        className="w-full h-8 text-[11px]"
        disabled={!selectedJobId || running}
        onClick={() => void handleRun()}
      >
        {running ? (
          <>
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Running…
          </>
        ) : (
          <>
            <Repeat className="w-3 h-3 mr-1" />
            Run across pages
          </>
        )}
      </Button>

      {error && (
        <p className="text-[10px] text-destructive leading-snug">{error}</p>
      )}
      <p className="text-[10px] text-muted-foreground/70 leading-snug">
        Results land in the <span className="font-medium">Extractions</span>{" "}
        pane (toggle it on from the toolbar).
      </p>
    </div>
  );
}
