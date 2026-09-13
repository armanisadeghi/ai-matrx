"use client";

// NoteConflictWindow — Rich conflict resolution floating window.
// Shows when an external change is detected while the user has local edits.
// Three tabs: Diff View, Your Version (editable), Remote Version (read-only).

import React, { useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle,
  X,
  GitCompare,
  GitMerge,
  FileText,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DiffViewer } from "@ai-matrx/diff/react";
import { DiffReview } from "@ai-matrx/diff/react";
import type { ReviewSession, ReviewSessionAction } from "@ai-matrx/diff";
import type { DiffAnalysis } from "@/features/notes/utils/diffAnalysis";

// ── Types ────────────────────────────────────────────────────────────────────

export interface NoteConflictWindowProps {
  noteTitle: string;
  localContent: string;
  remoteContent: string;
  analysis: DiffAnalysis;
  /** Reviewed physical-row details beyond the document body. */
  remoteDetails: Array<{ label: string; yours: string; saved: string; metadata?: { yours: unknown; saved: unknown } }>;
  mergeDraft: string;
  onMergeDraftChange: (content: string) => void;
  /** Notes owns this session so hunk choices survive window remounts. */
  reviewSession?: ReviewSession;
  onReviewTransition?: (action: ReviewSessionAction) => void;
  /** Called with the content from the (possibly edited) "Your Version" tab */
  onKeepMine: (content: string, choice?: "mine" | "merge") => void;
  /** Adopt the remote/server version */
  onAcceptChanges: () => void;
  /** Dismiss without action — keep local edits as dirty */
  onCancel: () => void;
  /** A newer remote observation invalidated this comparison. */
  stale: boolean;
  /** Re-read the canonical row while preserving the local merge draft. */
  onRefresh: () => Promise<void>;
  decisionError?: string | null;
  sourceChoiceRequired?: boolean;
  canUseCompletedSource?: boolean;
  onChooseSource?: (source: "proposal" | "completed") => void;
  locked?: boolean;
  /** Reads the current command lock, including before React has rerendered. */
  isCommandLocked?: () => boolean;
}

type Tab = "diff" | "merge" | "local" | "remote";

// ── Main component ───────────────────────────────────────────────────────────

export function NoteConflictWindow({
  noteTitle,
  localContent,
  remoteContent,
  analysis,
  remoteDetails,
  mergeDraft,
  onMergeDraftChange,
  reviewSession,
  onReviewTransition,
  onKeepMine,
  onAcceptChanges,
  onCancel,
  stale,
  onRefresh,
  decisionError,
  sourceChoiceRequired = false,
  canUseCompletedSource = false,
  onChooseSource,
  locked = false,
  isCommandLocked,
}: NoteConflictWindowProps) {
  const [activeTab, setActiveTab] = useState<Tab>("diff");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [inspectMetadata, setInspectMetadata] = useState(false);

  const commandLocked = () => isCommandLocked?.() ?? locked;
  const requestClose = () => { if (!commandLocked()) onCancel(); };
  const selectTab = (tab: Tab) => { if (!commandLocked()) setActiveTab(tab); };
  const handleRefresh = async () => {
    if (commandLocked() || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
      setRefreshError(null);
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Could not refresh the saved note. Try again.");
    } finally {
      setRefreshing(false);
    }
  };

  const tabClass = (tab: Tab) =>
    cn(
      "px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5",
      activeTab === tab
        ? "bg-accent text-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
    );

  const riskLevel = analysis.remoteHasContentLocalDoesNot ? "high" : "low";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) requestClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-[800px]"
        onEscapeKeyDown={(event) => { if (commandLocked()) event.preventDefault(); }}
        onInteractOutside={(event) => { if (commandLocked()) event.preventDefault(); }}
      >
        <DialogHeader className="flex-row items-center gap-2 border-b px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <DialogTitle className="min-w-0 flex-1 truncate text-sm">Note Conflict — {noteTitle}</DialogTitle>
          <DialogClose asChild>
            <button type="button" aria-label="Close conflict review" disabled={locked} aria-disabled={locked}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent disabled:opacity-50">
              <X className="h-3.5 w-3.5" />
            </button>
          </DialogClose>
        </DialogHeader>

        {/* Summary bar */}
        <div
          className={cn(
            "px-4 py-2 text-xs border-b shrink-0 flex items-center gap-2",
            riskLevel === "high"
              ? "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300"
              : "bg-muted/50 border-border/50 text-muted-foreground",
          )}
        >
          {riskLevel === "high" && (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          )}
          {analysis.summary}
        </div>

        {stale && (
          <div className="px-4 py-2 text-xs border-b border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300">
            A newer remote change arrived. Refresh this comparison before choosing a version.
          </div>
        )}
        {decisionError && <div role="alert" className="px-4 py-2 text-xs border-b border-destructive/30 bg-destructive/10 text-destructive">{decisionError}</div>}

        {sourceChoiceRequired && <div className="space-y-2 border-b px-4 py-3 text-sm">
          <p>The saved note changed. Choose which retained text to compare with it. Your earlier review remains available.</p>
          <button type="button" disabled={locked} className="rounded border px-3 py-2" onClick={() => { if (!commandLocked()) onChooseSource?.("proposal"); }}>Start latest review from Your Version</button>
          <button type="button" disabled={locked || !canUseCompletedSource} className="ml-2 rounded border px-3 py-2 disabled:opacity-50" onClick={() => { if (!commandLocked()) onChooseSource?.("completed"); }}>Use completed reviewed result</button>
        </div>}
        {/* Tab row */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border/50 shrink-0">
          <button className={tabClass("diff")} disabled={locked} onClick={() => selectTab("diff")}>
            <GitCompare className="w-3.5 h-3.5" /> Diff View
          </button>
          <button className={tabClass("merge")} disabled={locked} onClick={() => selectTab("merge")}>
            <GitMerge className="w-3.5 h-3.5" /> Merge
          </button>
          <button className={tabClass("local")} disabled={locked} onClick={() => selectTab("local")}>
            <FileText className="w-3.5 h-3.5" /> Your Version
          </button>
          <button className={tabClass("remote")} disabled={locked} onClick={() => selectTab("remote")}>
            <Globe className="w-3.5 h-3.5" /> Remote Version
          </button>
        </div>

        {/* Content area */}
        <div
          className={cn(
            "flex-1 min-h-0 overflow-auto",
            activeTab === "diff" || activeTab === "merge" ? "" : "p-4",
          )}
          style={{ maxHeight: "50dvh" }}
        >
          {activeTab === "diff" && (
            <DiffViewer
              original={remoteContent}
              modified={localContent}
              originalLabel="Remote"
              modifiedLabel="Yours"
              engine="light"
              defaultView="split"
            />
          )}

          {activeTab === "merge" && (
            reviewSession && onReviewTransition ? (
              <DiffReview
                session={reviewSession}
                onTransition={onReviewTransition}
                originalLabel="Remote"
                modifiedLabel="Yours"
                applyLabel="Save merged"
                disabled={stale || locked || sourceChoiceRequired}
                onApply={(merged) => { if (!commandLocked()) onKeepMine(merged, "merge"); }}
              />
            ) : (
              <DiffReview
                original={remoteContent}
                modified={localContent}
                originalLabel="Remote"
                modifiedLabel="Yours"
                disabled={stale || locked || sourceChoiceRequired}
                applyLabel="Save merged"
                onApply={(merged) => { if (!commandLocked()) onKeepMine(merged, "merge"); }}
              />
            )
          )}

          {activeTab === "local" && (
            <textarea
              value={mergeDraft}
              disabled={locked || sourceChoiceRequired}
              onChange={(e) => { if (!commandLocked()) onMergeDraftChange(e.target.value); }}
              className="w-full h-full min-h-[300px] resize-none bg-transparent text-sm font-mono leading-relaxed outline-none"
              style={{ fontSize: "16px" }}
            />
          )}

          {activeTab === "remote" && (
            <div className="space-y-4">
              <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap text-foreground/80">
                {remoteContent}
              </pre>
              <dl className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 border-t border-border/50 pt-3 text-xs">
                <dt className="font-medium text-muted-foreground">Field</dt><dt className="font-medium text-muted-foreground">Yours</dt><dt className="font-medium text-muted-foreground">Saved</dt>
                {remoteDetails.map((detail) => (
                  <React.Fragment key={detail.label}>
                    <dt className="font-medium text-muted-foreground">{detail.label}</dt>
                    <dd className="break-words text-foreground/80">{detail.yours}</dd>
                    <dd className="break-words text-foreground/80">{detail.saved}</dd>
                    {detail.metadata !== undefined && (
                      <button type="button" className="col-span-3 text-left text-primary underline" onClick={() => setInspectMetadata((open) => !open)}>
                        Inspect metadata details
                      </button>
                    )}
                  </React.Fragment>
                ))}
              </dl>
              {inspectMetadata && remoteDetails.filter((detail) => detail.metadata !== undefined).map((detail) => (
                <div key={`${detail.label}-metadata`} className="grid grid-cols-2 gap-2">
                  <pre className="overflow-auto rounded bg-muted p-2 text-xs"><strong>Your metadata</strong>{"\n"}{JSON.stringify(detail.metadata?.yours, null, 2)}</pre>
                  <pre className="overflow-auto rounded bg-muted p-2 text-xs"><strong>Saved metadata</strong>{"\n"}{JSON.stringify(detail.metadata?.saved, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-border bg-muted/20 shrink-0">
          <button
            onClick={() => { if (!commandLocked()) onKeepMine(mergeDraft); }}
            disabled={stale || locked || sourceChoiceRequired}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90"
          >
            Keep Mine
          </button>
          <button
            onClick={() => { if (!commandLocked()) onAcceptChanges(); }}
            disabled={stale || locked || sourceChoiceRequired}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground cursor-pointer hover:bg-accent"
          >
            Accept Changes
          </button>
          {refreshError && <p role="alert" className="text-xs text-destructive">{refreshError}</p>}
          <button
            onClick={requestClose}
            disabled={locked}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground cursor-pointer hover:text-foreground"
          >
            Cancel
          </button>

          <button
            onClick={handleRefresh}
            disabled={refreshing || locked}
            className="ml-auto px-3 py-1.5 text-xs rounded-md border border-border text-foreground cursor-pointer hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
