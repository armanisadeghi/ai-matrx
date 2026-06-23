"use client";

// CleanupReviewDialog — the review-and-accept step, built for normal people.
// Leads with the actual changes as plain-language cards (each with real
// Now -> After examples and an Apply/Skip switch), then tucks protected
// sections + details below. Apply re-runs the real engine with only the
// accepted operations (auto-versions); cancelling changes nothing.

import { useState } from "react";
import { ShieldCheck, Bug, ChevronDown, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopyForAiButton } from "@/components/agent-copy/CopyForAiButton";
import { cleanContent } from "@/lib/content-cleanup/clean";
import { buildOperationCards } from "@/lib/content-cleanup/review";
import { buildCleanupDebugXml } from "@/lib/content-cleanup/debug";
import type {
  CleanupOperationId,
  CleanupReport,
} from "@/lib/content-cleanup/types";
import { CleanupChangeCard } from "./CleanupChangeCard";
import { ProtectedRegionsInspector } from "./ProtectedRegionsInspector";
import { CleanupDebugPanel } from "./CleanupDebugPanel";

interface CleanupReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: CleanupReport;
  noteId: string;
  noteLabel: string;
  /** Apply the final cleaned content. Returns whether anything was written. */
  onApply: (finalContent: string) => boolean;
}

function Section({
  title,
  icon: Icon,
  badge,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
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
  const enabledIds = report.operations
    .filter((o) => o.enabled)
    .map((o) => o.id);
  // Compiler-memoized against `report`; stable across Apply/Skip toggles.
  const cards = buildOperationCards(report.original, enabledIds);

  // Every change applied by default (one-click great result).
  const [accepted, setAccepted] = useState<Set<CleanupOperationId>>(
    () => new Set(cards.map((c) => c.id)),
  );

  const toggle = (id: CleanupOperationId, isAccepted: boolean) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (isAccepted) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const applyAll = () => setAccepted(new Set(cards.map((c) => c.id)));
  const skipAll = () => setAccepted(new Set());

  // The real engine produces the final content from the accepted operations.
  const finalContent = cleanContent(report.original, accepted).cleaned;
  const willWrite = finalContent !== report.original;
  const protectedCount = report.protectedRegions.length;

  const handleApply = () => {
    onApply(finalContent);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[88vh] w-[92vw] max-w-3xl flex-col gap-0 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* pr-14 clears the Dialog's built-in close (X) button */}
        <DialogHeader className="shrink-0 flex-row items-center gap-2 space-y-0 border-b border-border px-4 py-3 pr-14">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <DialogTitle className="min-w-0 truncate text-sm">
            Review changes — {noteLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">
            {cards.length} type{cards.length !== 1 ? "s" : ""} of change ·{" "}
            <span className="text-foreground">{accepted.size} applied</span>
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[0.6875rem]"
              onClick={applyAll}
              disabled={accepted.size === cards.length}
            >
              Apply all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[0.6875rem]"
              onClick={skipAll}
              disabled={accepted.size === 0}
            >
              Skip all
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 space-y-2.5 overflow-y-auto bg-textured px-4 py-3">
          {cards.length === 0 ? (
            <div className="rounded-md border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
              No textual changes were produced.
            </div>
          ) : (
            cards.map((card) => (
              <CleanupChangeCard
                key={card.id}
                card={card}
                accepted={accepted.has(card.id)}
                onToggle={toggle}
              />
            ))
          )}

          {protectedCount > 0 && (
            <Section
              title="Protected — left untouched"
              icon={ShieldCheck}
              badge={
                <span className="ml-1 rounded bg-muted px-1.5 py-px text-[0.625rem] text-muted-foreground">
                  {protectedCount}
                </span>
              }
            >
              <ProtectedRegionsInspector regions={report.protectedRegions} />
            </Section>
          )}

          <Section title="Details" icon={Bug}>
            <CleanupDebugPanel
              report={report}
              debugContext={{ noteId, noteLabel }}
            />
          </Section>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <div className="ml-auto flex items-center gap-2">
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
            <Button
              size="sm"
              className="h-8"
              disabled={!willWrite}
              onClick={handleApply}
            >
              {accepted.size === 0 ? "Nothing applied" : "Apply changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
