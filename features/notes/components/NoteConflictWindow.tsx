"use client";

// NoteConflictWindow — Rich conflict resolution floating window.
// Shows when an external change is detected while the user has local edits.
// Three tabs: Diff View, Your Version (editable), Remote Version (read-only).

import React, { useState, useCallback, useRef } from "react";
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
import type { DiffAnalysis } from "@/features/notes/utils/diffAnalysis";

// ── Types ────────────────────────────────────────────────────────────────────

export interface NoteConflictWindowProps {
  noteTitle: string;
  localContent: string;
  remoteContent: string;
  analysis: DiffAnalysis;
  /** Reviewed physical-row details beyond the document body. */
  remoteDetails: Array<{ label: string; yours: string; saved: string; metadata?: unknown }>;
  mergeDraft: string;
  onMergeDraftChange: (content: string) => void;
  /** Called with the content from the (possibly edited) "Your Version" tab */
  onKeepMine: (content: string) => void;
  /** Adopt the remote/server version */
  onAcceptChanges: () => void;
  /** Dismiss without action — keep local edits as dirty */
  onCancel: () => void;
  /** A newer remote observation invalidated this comparison. */
  stale: boolean;
  /** Re-read the canonical row while preserving the local merge draft. */
  onRefresh: () => Promise<void>;
  decisionError?: string | null;
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
  onKeepMine,
  onAcceptChanges,
  onCancel,
  stale,
  onRefresh,
  decisionError,
}: NoteConflictWindowProps) {
  const [activeTab, setActiveTab] = useState<Tab>("diff");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [inspectMetadata, setInspectMetadata] = useState(false);

  // Drag state
  const [pos, setPos] = useState({ x: -1, y: -1 });
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Center on first render
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  if (!initialized.current && typeof window !== "undefined") {
    initialized.current = true;
    const w = Math.min(800, window.innerWidth - 40);
    const h = Math.min(600, window.innerHeight - 80);
    setPos({
      x: Math.max(20, (window.innerWidth - w) / 2),
      y: Math.max(40, (window.innerHeight - h) / 2),
    });
  }

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragStart.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
      const handleMove = (ev: MouseEvent) => {
        if (!dragStart.current) return;
        setPos({
          x: dragStart.current.ox + (ev.clientX - dragStart.current.x),
          y: dragStart.current.oy + (ev.clientY - dragStart.current.y),
        });
      };
      const handleUp = () => {
        dragStart.current = null;
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [pos],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Could not refresh the saved note. Try again.");
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const tabClass = (tab: Tab) =>
    cn(
      "px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5",
      activeTab === tab
        ? "bg-accent text-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
    );

  const riskLevel = analysis.remoteHasContentLocalDoesNot ? "high" : "low";

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-[2px]" />

      {/* Window */}
      <div
        ref={containerRef}
        className="fixed z-[201] flex flex-col bg-card/95 backdrop-blur-2xl border border-border rounded-xl shadow-2xl overflow-hidden"
        style={{
          left: pos.x,
          top: pos.y,
          width: Math.min(800, typeof window !== "undefined" ? window.innerWidth - 40 : 800),
          maxHeight: "80dvh",
        }}
      >
        {/* Header — draggable */}
        <div
          className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30 cursor-move select-none shrink-0"
          onMouseDown={handleMouseDown}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-sm font-semibold flex-1 truncate">
            Note Conflict — {noteTitle}
          </span>
          <button
            onClick={onCancel}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-accent cursor-pointer [&_svg]:w-3.5 [&_svg]:h-3.5 text-muted-foreground hover:text-foreground"
          >
            <X />
          </button>
        </div>

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

        {/* Tab row */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border/50 shrink-0">
          <button className={tabClass("diff")} onClick={() => setActiveTab("diff")}>
            <GitCompare className="w-3.5 h-3.5" /> Diff View
          </button>
          <button className={tabClass("merge")} onClick={() => setActiveTab("merge")}>
            <GitMerge className="w-3.5 h-3.5" /> Merge
          </button>
          <button className={tabClass("local")} onClick={() => setActiveTab("local")}>
            <FileText className="w-3.5 h-3.5" /> Your Version
          </button>
          <button className={tabClass("remote")} onClick={() => setActiveTab("remote")}>
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
            <DiffReview
              original={remoteContent}
              modified={localContent}
              originalLabel="Remote"
              modifiedLabel="Yours"
              applyLabel="Save merged"
              onApply={(merged) => onKeepMine(merged)}
            />
          )}

          {activeTab === "local" && (
            <textarea
              value={mergeDraft}
              onChange={(e) => onMergeDraftChange(e.target.value)}
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
                <pre key={`${detail.label}-metadata`} className="overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(detail.metadata, null, 2)}</pre>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-muted/20 shrink-0">
          <button
            onClick={() => onKeepMine(mergeDraft)}
            disabled={stale}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90"
          >
            Keep Mine
          </button>
          <button
            onClick={onAcceptChanges}
            disabled={stale}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground cursor-pointer hover:bg-accent"
          >
            Accept Changes
          </button>
          {refreshError && <p role="alert" className="text-xs text-destructive">{refreshError}</p>}
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground cursor-pointer hover:text-foreground"
          >
            Cancel
          </button>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="ml-auto px-3 py-1.5 text-xs rounded-md border border-border text-foreground cursor-pointer hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
    </>
  );
}
