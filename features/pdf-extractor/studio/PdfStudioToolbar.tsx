"use client";

/**
 * PdfStudioToolbar — sticky top bar above the reader.
 *
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │ ←  doc name                         · Pages 142 · OCR · Native     │
 *   │     parent · derivation breadcrumb  · char-count · created ago     │
 *   │                                  Find  Pipeline  Share  •••        │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * Designed so a manager triaging a long doc immediately sees: what is this,
 * where did it come from (provenance), how big, and what they can do next.
 */

import React from "react";
import {
  ArrowLeft,
  ChevronRight,
  Layers,
  GitBranch,
  Zap,
  ExternalLink,
  Loader2,
  Search,
  RefreshCw,
  PartyPopper,
  ClipboardList
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PdfSurfaceSwitcher } from "@/features/pdf/components/PdfSurfaceSwitcher";
import type { PdfDocument } from "../hooks/usePdfExtractor";

export interface PdfStudioToolbarProps {
  doc: PdfDocument | null;
  /** Total pages currently rendered — may differ from doc.totalPages on legacy rows. */
  pageRowCount: number;
  hasPageRows: boolean;
  /** Page the user is currently viewing in the synced reader. */
  activePage: number | null;
  onJumpToPage: (n: number) => void;
  onOpenFind: () => void;
  onRunPipeline: () => void;
  pipelineRunning: boolean;
  onRunAiClean: () => void;
  aiCleanRunning: boolean;
  /** Latest streaming progress message — surfaced under the toolbar so the
   *  user always knows what's happening. Cleared when idle. */
  liveStatus?: string | null;
  onOpenSource: () => void;
  onOpenCopyPages: () => void;
}

export function PdfStudioToolbar({
  doc,
  pageRowCount,
  hasPageRows,
  activePage,
  onJumpToPage,
  onOpenFind,
  onRunPipeline,
  pipelineRunning,
  onRunAiClean,
  aiCleanRunning,
  liveStatus,
  onOpenSource,
  onOpenCopyPages,
}: PdfStudioToolbarProps) {
  if (!doc) {
    return (
      <div className="shrink-0 h-14 border-b border-border bg-card/40 flex items-center px-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Home
        </Link>
        <span className="ml-3 text-sm text-muted-foreground">
          Select a document from the sidebar
        </span>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-border bg-card/40">
      {/* Row 1 — title + provenance breadcrumb + chips */}
      <div className="flex items-center gap-3 px-4 pt-2.5 pb-1.5 min-w-0">
        <Link
          href="/tools/pdf-extractor"
          className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          title="Back to studio"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm font-semibold truncate" title={doc.name}>
              {doc.name}
            </h1>
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
              {doc.id.slice(0, 8)}
            </span>
          </div>

          {/* Provenance breadcrumb */}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5 min-w-0">
            <Layers className="w-2.5 h-2.5" />
            <span>{doc.derivationKind}</span>
            {doc.parentProcessedId && (
              <>
                <ChevronRight className="w-2.5 h-2.5" />
                <GitBranch className="w-2.5 h-2.5" />
                <span title={doc.parentProcessedId}>
                  parent {doc.parentProcessedId.slice(0, 8)}
                </span>
              </>
            )}
            {doc.sourceKind && (
              <>
                <ChevronRight className="w-2.5 h-2.5" />
                <span>{doc.sourceKind}</span>
              </>
            )}
          </div>
        </div>

        {/* Chips */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Chip>{(doc.totalPages ?? pageRowCount).toLocaleString()} pages</Chip>
          <Chip muted>{doc.charCount.toLocaleString()} chars</Chip>
          {!hasPageRows && <Chip tone="amber">no per-page</Chip>}
          {doc.cleanContent && <Chip tone="emerald">cleaned</Chip>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <PdfSurfaceSwitcher
            current="extractor-studio"
            fileId={doc.sourceKind === "cld_file" ? doc.sourceId : null}
            processedDocumentId={doc.id}
            size="icon"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1"
            onClick={onOpenFind}
            title="Find in document — Cmd+F"
          >
            <Search className="w-3 h-3" />
            Find
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1"
            onClick={onRunAiClean}
            disabled={aiCleanRunning || pipelineRunning}
            title="Run AI cleanup on the extracted text — populates clean_content"
          >
            {aiCleanRunning ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Cleaning…
              </>
            ) : (
              <>
                <PartyPopper className="w-3 h-3" />
                AI Clean
              </>
            )}
          </Button>
          <Button
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={onRunPipeline}
            disabled={pipelineRunning || aiCleanRunning}
            title="Re-run extract → cleanup → chunk → AI"
          >
            {pipelineRunning ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Running…
              </>
            ) : (
              <>
                <Zap className="w-3 h-3" />
                Pipeline
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1"
            onClick={onOpenCopyPages}
            title="Copy page range to clipboard with structured tags"
          >
            <ClipboardList className="w-3 h-3" />
            Copy Pages
          </Button>
          {doc.source && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1"
              onClick={onOpenSource}
              title="Open source PDF in a new tab"
            >
              <ExternalLink className="w-3 h-3" />
              Source
            </Button>
          )}
        </div>
      </div>

      {/* Row 2 — page nav + density */}
      <div className="flex items-center gap-2 px-4 pb-2">
        <PageJumper
          activePage={activePage}
          totalPages={doc.totalPages ?? pageRowCount}
          onJumpToPage={onJumpToPage}
        />
        <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <RefreshCw className="w-2.5 h-2.5" />
          updated {formatRelativeTime(doc.updatedAt)}
        </div>
      </div>

      {/* Live status strip — surfaces NDJSON progress messages from the
          AI Clean / Pipeline endpoints so the user always knows what's
          happening. Was a major UX gap before; clicks were silent. */}
      {(aiCleanRunning || pipelineRunning || liveStatus) && (
        <div className="px-4 py-1 border-t border-border bg-primary/5 flex items-center gap-2 text-[10px]">
          <Loader2 className="w-2.5 h-2.5 animate-spin text-primary shrink-0" />
          <span className="font-medium text-primary shrink-0">
            {aiCleanRunning ? "AI cleanup" : "Pipeline"} running
          </span>
          {liveStatus && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground truncate">
                {liveStatus}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function Chip({
  children,
  tone,
  muted,
}: {
  children: React.ReactNode;
  tone?: "amber" | "emerald";
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 h-5 rounded text-[10px] font-medium border",
        tone === "amber" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        tone === "emerald" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        !tone && !muted && "border-border bg-muted text-foreground",
        muted && "border-border/60 bg-transparent text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function PageJumper({
  activePage,
  totalPages,
  onJumpToPage,
}: {
  activePage: number | null;
  totalPages: number | null;
  onJumpToPage: (n: number) => void;
}) {
  const total = totalPages ?? 0;
  const [draft, setDraft] = React.useState<string>("");

  React.useEffect(() => {
    if (activePage != null) setDraft(String(activePage));
  }, [activePage]);

  const submit = () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 1) return;
    onJumpToPage(Math.min(n, Math.max(total, 1)));
  };

  return (
    <div className="flex items-center gap-1 text-[11px]">
      <button
        type="button"
        className="h-6 px-2 rounded border border-border bg-background hover:bg-accent disabled:opacity-50"
        onClick={() =>
          activePage && activePage > 1 && onJumpToPage(activePage - 1)
        }
        disabled={!activePage || activePage <= 1}
        title="Previous page (k)"
      >
        ‹
      </button>
      <span className="flex items-center gap-1 px-2 h-6 rounded border border-border bg-background text-[11px]">
        Page
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              submit();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="w-10 text-center bg-transparent outline-none tabular-nums"
          inputMode="numeric"
          style={{ fontSize: "16px" }}
        />
        <span className="text-muted-foreground">
          / {total.toLocaleString()}
        </span>
      </span>
      <button
        type="button"
        className="h-6 px-2 rounded border border-border bg-background hover:bg-accent disabled:opacity-50"
        onClick={() =>
          activePage &&
          total &&
          activePage < total &&
          onJumpToPage(activePage + 1)
        }
        disabled={!activePage || !total || activePage >= total}
        title="Next page (j)"
      >
        ›
      </button>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}
