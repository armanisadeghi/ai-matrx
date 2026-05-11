"use client";

// NoteConflictWindow — Rich conflict resolution floating window.
// Shows when an external change is detected while the user has local edits.
// Three tabs: Diff View, Your Version (editable), Remote Version (read-only).

import React, { useState, useCallback, useRef } from "react";
import {
  AlertTriangle,
  X,
  GitCompare,
  FileText,
  Globe,
  Bug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DiffAnalysis, DiffSegment } from "@/features/notes/utils/diffAnalysis";

// ── Types ────────────────────────────────────────────────────────────────────

export interface NoteConflictWindowProps {
  noteTitle: string;
  localContent: string;
  remoteContent: string;
  analysis: DiffAnalysis;
  /** Called with the content from the (possibly edited) "Your Version" tab */
  onKeepMine: (content: string) => void;
  /** Adopt the remote/server version */
  onAcceptChanges: () => void;
  /** Dismiss without action — keep local edits as dirty */
  onCancel: () => void;
}

type Tab = "diff" | "local" | "remote";

// ── Diff segment renderer ────────────────────────────────────────────────────

function DiffView({ segments }: { segments: DiffSegment[] }) {
  return (
    <div className="font-mono text-xs leading-relaxed whitespace-pre-wrap">
      {segments.map((seg, i) => (
        <span
          key={i}
          className={cn(
            seg.type === "added" &&
              "bg-green-500/15 text-green-700 dark:text-green-300",
            seg.type === "removed" &&
              "bg-red-500/15 text-red-700 dark:text-red-300 line-through",
            seg.type === "unchanged" && "text-foreground/70",
          )}
        >
          {seg.type === "added" && "+ "}
          {seg.type === "removed" && "- "}
          {seg.content}
          {"\n"}
        </span>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function NoteConflictWindow({
  noteTitle,
  localContent,
  remoteContent,
  analysis,
  onKeepMine,
  onAcceptChanges,
  onCancel,
}: NoteConflictWindowProps) {
  const [activeTab, setActiveTab] = useState<Tab>("diff");
  const [editableContent, setEditableContent] = useState(localContent);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

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

  const handleReport = useCallback(async () => {
    setReporting(true);
    try {
      await fetch("/api/agent/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          feedback_type: "bug",
          route: window.location.pathname,
          description: [
            "False conflict report — user says versions are identical.",
            `Note: "${noteTitle}"`,
            `Analysis: ${analysis.summary}`,
            `Local length: ${localContent.length}`,
            `Remote length: ${remoteContent.length}`,
            `Chars changed: ${analysis.charsChanged}`,
            `Lines changed: ${analysis.linesChanged}`,
          ].join("\n"),
        }),
      });
      setReported(true);
    } catch {
      // Silently fail — not critical
    } finally {
      setReporting(false);
    }
  }, [noteTitle, analysis, localContent, remoteContent]);

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
          maxHeight: "80vh",
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

        {/* Tab row */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border/50 shrink-0">
          <button className={tabClass("diff")} onClick={() => setActiveTab("diff")}>
            <GitCompare className="w-3.5 h-3.5" /> Diff View
          </button>
          <button className={tabClass("local")} onClick={() => setActiveTab("local")}>
            <FileText className="w-3.5 h-3.5" /> Your Version
          </button>
          <button className={tabClass("remote")} onClick={() => setActiveTab("remote")}>
            <Globe className="w-3.5 h-3.5" /> Remote Version
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 overflow-auto p-4" style={{ maxHeight: "50vh" }}>
          {activeTab === "diff" && <DiffView segments={analysis.segments} />}

          {activeTab === "local" && (
            <textarea
              value={editableContent}
              onChange={(e) => setEditableContent(e.target.value)}
              className="w-full h-full min-h-[300px] resize-none bg-transparent text-sm font-mono leading-relaxed outline-none"
              style={{ fontSize: "16px" }}
            />
          )}

          {activeTab === "remote" && (
            <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap text-foreground/80">
              {remoteContent}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-muted/20 shrink-0">
          <button
            onClick={() => onKeepMine(editableContent)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90"
          >
            Keep Mine
          </button>
          <button
            onClick={onAcceptChanges}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground cursor-pointer hover:bg-accent"
          >
            Accept Changes
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground cursor-pointer hover:text-foreground"
          >
            Cancel
          </button>

          <div className="flex-1" />

          <button
            onClick={handleReport}
            disabled={reporting || reported}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md cursor-pointer transition-colors",
              reported
                ? "text-green-600 dark:text-green-400"
                : "text-muted-foreground hover:text-foreground border border-border/50 hover:bg-accent/50",
            )}
          >
            <Bug className="w-3 h-3" />
            {reported
              ? "Reported"
              : reporting
                ? "Sending..."
                : "Report Problem"}
          </button>
        </div>
      </div>
    </>
  );
}
