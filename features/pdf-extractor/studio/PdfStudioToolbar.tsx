"use client";

/**
 * PdfStudioToolbar — sticky top bar above the reader.
 *
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │ ←  doc name ···   ‹  3 / 142  ›          Pipeline  Find  •••     │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * Document metadata (pages, chars, context, updated) lives in the left
 * column pages panel — see `PdfStudioPagesMeta`.
 */

import React from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import {
  ChevronLeftTapButton,
  ChevronRightTapButton,
  ZapTapButton,
  PartyPopperTapButton,
  ClipboardListTapButton,
  SearchTapButton,
  ExternalLinkTapButton,
  LoadingTapButton,
  RetryTapButton,
} from "@/components/icons/tap-buttons";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";
import { PdfStudioDocTitle } from "./PdfStudioDocTitle";
import type { PdfDocument } from "../hooks/usePdfExtractor";

export interface PdfStudioToolbarProps {
  doc: PdfDocument | null;
  /** Page the user is currently viewing in the synced reader. */
  activePage: number | null;
  totalPages: number;
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
  /** Reload the active document + per-page rows from Supabase. */
  onRefresh: () => void;
  refreshing: boolean;
  /** Commit a new document name (renames doc + backing cloud file). */
  onRename: (newName: string) => void | Promise<void>;
  /** Archive (soft-delete) the active doc from the studio. */
  onDeleteDoc: (id: string) => Promise<void>;
}

export function PdfStudioToolbar({
  doc,
  activePage,
  totalPages,
  onJumpToPage,
  onOpenFind,
  onRunPipeline,
  pipelineRunning,
  onRunAiClean,
  aiCleanRunning,
  liveStatus,
  onOpenSource,
  onOpenCopyPages,
  onRefresh,
  refreshing,
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

  const actionsBusy = pipelineRunning || aiCleanRunning || refreshing;

  return (
    <div className="shrink-0 border-b border-border bg-card/40">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-0 min-w-0">
        <div className="flex items-center gap-0 min-w-0 justify-self-start">
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

        <PageJumperTapGroup
          activePage={activePage}
          totalPages={totalPages}
          onJumpToPage={onJumpToPage}
        />

        <div className="flex items-center justify-self-end">
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
            {refreshing ? (
              <LoadingTapButton
                variant="group"
                disabled
                ariaLabel="Refreshing"
              />
            ) : (
              <RetryTapButton
                variant="group"
                onClick={onRefresh}
                disabled={actionsBusy}
                ariaLabel="Refresh"
                tooltip="Refresh document"
              />
            )}
            {hasSource && (
              <ExternalLinkTapButton
                variant="group"
                onClick={onOpenSource}
                ariaLabel="Open source"
              />
            )}
          </TapTargetButtonGroup>
        </div>
      </div>

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

function PageJumperTapGroup({
  activePage,
  totalPages,
  onJumpToPage,
}: {
  activePage: number | null;
  totalPages: number;
  onJumpToPage: (n: number) => void;
}) {
  const total = Math.max(totalPages, 0);
  const [draft, setDraft] = React.useState("");

  React.useEffect(() => {
    if (activePage != null) setDraft(String(activePage));
  }, [activePage]);

  const submit = () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 1) return;
    onJumpToPage(Math.min(n, Math.max(total, 1)));
  };

  return (
    <TapTargetButtonGroup>
      <ChevronLeftTapButton
        variant="group"
        onClick={() =>
          activePage && activePage > 1 && onJumpToPage(activePage - 1)
        }
        disabled={!activePage || activePage <= 1}
        ariaLabel="Previous page"
        tooltip="Previous page (k)"
      />
      <label className="flex h-6 items-center gap-0.5 px-0.5 text-[11px] tabular-nums text-foreground">
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
          className="w-7 bg-transparent text-center text-[11px] outline-none"
          inputMode="numeric"
          aria-label="Current page"
        />
        <span className="text-[11px] text-muted-foreground">
          / {total.toLocaleString()}
        </span>
      </label>
      <ChevronRightTapButton
        variant="group"
        onClick={() =>
          activePage &&
          total > 0 &&
          activePage < total &&
          onJumpToPage(activePage + 1)
        }
        disabled={!activePage || total <= 0 || activePage >= total}
        ariaLabel="Next page"
        tooltip="Next page (j)"
      />
    </TapTargetButtonGroup>
  );
}
