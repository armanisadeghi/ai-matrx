"use client";

// CleanupReviewDialog — the review-and-accept step. Full diff with per-hunk
// staging, the protected-sections inspector, a debug panel, and "Copy for AI".
// Accepting writes only the staged hunks back to the note (which auto-versions);
// cancelling changes nothing — the user's "go back".

import { useState } from "react";
import {
  Eraser,
  ShieldCheck,
  Bug,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CopyForAiButton } from "@/components/agent-copy/CopyForAiButton";
import {
  buildDiffSegments,
  reconstructFromSegments,
} from "@/lib/content-cleanup/staging";
import { buildCleanupDebugXml } from "@/lib/content-cleanup/debug";
import type { CleanupReport } from "@/lib/content-cleanup/types";
import { CleanupStagedDiff } from "./CleanupStagedDiff";
import { ProtectedRegionsInspector } from "./ProtectedRegionsInspector";
import { CleanupDebugPanel } from "./CleanupDebugPanel";

interface CleanupReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: CleanupReport;
  noteId: string;
  noteLabel: string;
  /** Apply the final staged content. Returns whether anything was written. */
  onApply: (finalContent: string) => boolean;
}

function Section({
  title,
  icon: Icon,
  badge,
  defaultOpen,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {title}
        {badge}
      </button>
      {open && <div className="border-t border-border px-3 py-2">{children}</div>}
    </div>
  );
}

export function CleanupReviewDialog({
  open,
  onOpenChange,
  report,
  noteId,
  noteLabel,
  onApply,
}: CleanupReviewDialogProps) {
  // React Compiler memoizes this against `report`; stable across hunk toggles.
  const { segments, hunkCount } = buildDiffSegments(
    report.original,
    report.cleaned,
  );

  // All hunks accepted by default (one-click great result).
  const [accepted, setAccepted] = useState<Set<number>>(
    () => new Set(Array.from({ length: hunkCount }, (_, i) => i)),
  );

  const toggleHunk = (index: number, isAccepted: boolean) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (isAccepted) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  const acceptAll = () =>
    setAccepted(new Set(Array.from({ length: hunkCount }, (_, i) => i)));
  const rejectAll = () => setAccepted(new Set());

  const finalContent = reconstructFromSegments(segments, accepted);
  const willWrite = finalContent !== report.original;

  const handleApply = () => {
    const wrote = onApply(finalContent);
    onOpenChange(false);
    return wrote;
  };

  const protectedCount = report.protectedRegions.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[88vh] w-[92vw] max-w-5xl flex-col gap-0 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-4 py-2.5">
          <Eraser className="h-4 w-4 text-primary" />
          <div className="min-w-0">
            <DialogTitle className="truncate text-sm">
              Review cleanup — {noteLabel}
            </DialogTitle>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {accepted.size} of {hunkCount} change{hunkCount !== 1 ? "s" : ""}{" "}
              selected
            </span>
            <CopyForAiButton
              label="Cleanup debug"
              agent={() =>
                buildCleanupDebugXml(report, {
                  noteId,
                  noteLabel,
                  timestamp: new Date().toISOString(),
                })
              }
              size="sm"
            />
          </div>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-border px-4 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[0.6875rem]"
            onClick={acceptAll}
            disabled={accepted.size === hunkCount}
          >
            Accept all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[0.6875rem]"
            onClick={rejectAll}
            disabled={accepted.size === 0}
          >
            Reject all
          </Button>
          <span className="ml-auto text-[0.6875rem] text-muted-foreground">
            {report.stats.charsBefore} → {report.stats.charsAfter} chars
          </span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto bg-textured px-4 py-3">
          <Section
            title="Protected sections"
            icon={ShieldCheck}
            defaultOpen={protectedCount > 0}
            badge={
              <span className="ml-1 rounded bg-muted px-1.5 py-px text-[0.625rem] text-muted-foreground">
                {protectedCount}
              </span>
            }
          >
            <ProtectedRegionsInspector regions={report.protectedRegions} />
          </Section>

          {hunkCount > 0 ? (
            <CleanupStagedDiff
              segments={segments}
              acceptedHunks={accepted}
              onToggleHunk={toggleHunk}
            />
          ) : (
            <div className="rounded-md border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
              No textual changes were produced.
            </div>
          )}

          <Section title="Debug" icon={Bug}>
            <CleanupDebugPanel
              report={report}
              debugContext={{ noteId, noteLabel }}
            />
          </Section>
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <div className="ml-auto" />
          <Button
            size="sm"
            className={cn("h-8 gap-1.5")}
            disabled={!willWrite}
            onClick={handleApply}
          >
            <Eraser className="h-3.5 w-3.5" />
            {accepted.size === 0
              ? "Nothing selected"
              : `Apply ${accepted.size} change${accepted.size !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
