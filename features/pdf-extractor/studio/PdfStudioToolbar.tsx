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
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import {
  ChevronLeftTapButton,
  ZapTapButton,
  PartyPopperTapButton,
  ClipboardListTapButton,
  SearchTapButton,
  ExternalLinkTapButton,
  LoadingTapButton,
} from "@/components/icons/tap-buttons";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";
import { cn } from "@/lib/utils";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import { ContextStatusButton } from "@/features/scopes/components/context-assignment/ContextStatusButton";
import { setRowScopes } from "@/features/scopes/components/context-assignment/data";
import { PdfStudioDocTitle } from "./PdfStudioDocTitle";
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
  /** Commit a new document name (renames doc + backing cloud file). */
  onRename: (newName: string) => void | Promise<void>;
  /** Archive (soft-delete) the active doc from the studio. */
  onDeleteDoc: (id: string) => Promise<void>;
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
  onRename,
  onDeleteDoc,
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

  const hasSource =
    (doc.sourceKind === "cld_file" && !!doc.sourceId) ||
    !!doc.source?.startsWith("http://") ||
    !!doc.source?.startsWith("https://");

  const actionsBusy = pipelineRunning || aiCleanRunning;

  return (
    <div className="shrink-0 border-b border-border bg-card/40">
      {/* Row 1 — title + actions */}
      <div className="flex items-center px-4 pt-2.5 pb-1.5 min-w-0">
        <div className="flex items-center gap-0 min-w-0 flex-1">
          <ChevronLeftTapButton
            href="/tools/pdf-extractor"
            ariaLabel="Back to studio"
          />
          <PdfStudioDocTitle
            doc={doc}
            onRename={onRename}
            onDeleteDoc={onDeleteDoc}
          />
        </div>

        <TapTargetButtonGroup>
          {pipelineRunning ? (
            <LoadingTapButton
              variant="group"
              disabled
              ariaLabel="Pipeline running"
            />
          ) : (
            <ZapTapButton
              variant="group"
              onClick={onRunPipeline}
              disabled={actionsBusy}
              ariaLabel="Pipeline"
            />
          )}
          {aiCleanRunning ? (
            <LoadingTapButton
              variant="group"
              disabled
              ariaLabel="AI Clean running"
            />
          ) : (
            <PartyPopperTapButton
              variant="group"
              onClick={onRunAiClean}
              disabled={actionsBusy}
              ariaLabel="AI Clean"
            />
          )}
          <ClipboardListTapButton
            variant="group"
            onClick={onOpenCopyPages}
            ariaLabel="Copy Pages"
          />
          <SearchTapButton
            variant="group"
            onClick={onOpenFind}
            ariaLabel="Find"
          />
          {hasSource && (
            <ExternalLinkTapButton
              variant="group"
              onClick={onOpenSource}
              ariaLabel="Open source"
            />
          )}
        </TapTargetButtonGroup>
      </div>

      {/* Row 2 — page nav + chips + density */}
      <div className="flex items-center gap-2 px-4 pb-2 min-w-0">
        <PageJumper
          activePage={activePage}
          totalPages={doc.totalPages ?? pageRowCount}
          onJumpToPage={onJumpToPage}
        />
        {/* Chips — metadata + context status for the underlying cloud file
            (the same entity the files table/preview tag, so all three surfaces
            stay in sync). */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-thin">
          {doc.sourceKind === "cld_file" && doc.sourceId && (
            <PdfFileContextChip fileId={doc.sourceId} fileName={doc.name} />
          )}
          <Chip>{(doc.totalPages ?? pageRowCount).toLocaleString()} pages</Chip>
          <Chip muted>{doc.charCount.toLocaleString()} chars</Chip>
          {!hasPageRows && <Chip tone="amber">no per-page</Chip>}
          {doc.cleanContent && <Chip tone="emerald">cleaned</Chip>}
        </div>
        <div className="ml-auto shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground">
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
    <div className="flex items-center text-[11px]">
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded-l-md border border-border bg-background hover:bg-accent disabled:opacity-50"
        onClick={() =>
          activePage && activePage > 1 && onJumpToPage(activePage - 1)
        }
        disabled={!activePage || activePage <= 1}
        title="Previous page (k)"
        aria-label="Previous page"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="flex h-6 items-center gap-1 border-y border-border bg-background px-2 text-[11px]">
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
          // 16px on mobile prevents iOS focus-zoom; 11px on desktop keeps
          // the number the same size as the rest of the count.
          className="w-7 bg-transparent text-center text-base tabular-nums outline-none md:text-[11px]"
          inputMode="numeric"
          aria-label="Current page"
        />
        <span className="text-muted-foreground">
          / {total.toLocaleString()}
        </span>
      </span>
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded-r-md border border-border bg-background hover:bg-accent disabled:opacity-50"
        onClick={() =>
          activePage &&
          total &&
          activePage < total &&
          onJumpToPage(activePage + 1)
        }
        disabled={!activePage || !total || activePage >= total}
        title="Next page (j)"
        aria-label="Next page"
      >
        <ChevronRight className="h-3.5 w-3.5" />
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

/**
 * Context status chip for the studio's underlying cloud file. Amber = no
 * context (and this document is invisible to scoped RAG/NER) — click to
 * assign via the official picker. Saves write through to the row-scope store
 * so the files table updates in lock-step.
 */
function PdfFileContextChip({
  fileId,
  fileName,
}: {
  fileId: string;
  fileName: string;
}) {
  const es = useEntityScopes({ entityType: "file", entityId: fileId });
  const n = es.scopeIds.length;
  return (
    <ContextStatusButton
      size="xs"
      showScopeLabel
      subject={{ entityType: "file", entityId: fileId, title: fileName }}
      knownScopeCount={n}
      writeMode="live"
      onSaved={(r) => {
        if (!r.ok) return;
        setRowScopes(
          "file",
          fileId,
          r.selection.scopeIds.filter((id) => !id.startsWith("new:")),
        );
        void es.refresh();
      }}
    />
  );
}
