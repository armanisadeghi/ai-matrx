"use client";

// CleanupReviewDialog — the review-and-accept step, built for normal people.
// Leads with the actual changes as plain-language cards (each with real
// Now -> After examples and an Apply/Skip switch), then tucks protected
// sections + details below. Apply re-runs the real engine with only the
// accepted operations (auto-versions); cancelling changes nothing.

import { useState } from "react";
import {
  ShieldCheck,
  Bug,
  ChevronDown,
  ChevronRight,
  Columns2,
  ListChecks,
} from "lucide-react";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { cn } from "@/lib/utils";
import { CopyForAiButton } from "@/components/agent-copy/CopyForAiButton";
import { cleanContent } from "@/lib/content-cleanup/clean";
import {
  buildOperationCards,
  buildRegionOperationCards,
} from "@/lib/content-cleanup/review";
import { buildCleanupDebugXml } from "@/lib/content-cleanup/debug";
import type {
  CleanupOperationId,
  CleanupRegionOperationId,
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
  // Region cards (JSON re-prints) come from the frozen report, not a re-derive:
  // a region rewrite is a parse + re-print, so the recorded before/after IS it.
  const regionCards = buildRegionOperationCards(report);
  const cardCount = cards.length + regionCards.length;

  // Every change applied by default (one-click great result).
  const [accepted, setAccepted] = useState<Set<CleanupOperationId>>(
    () => new Set(cards.map((c) => c.id)),
  );
  const [acceptedRegions, setAcceptedRegions] = useState<
    Set<CleanupRegionOperationId>
  >(() => new Set(regionCards.map((c) => c.id)));
  const acceptedCount = accepted.size + acceptedRegions.size;

  const toggle = (id: CleanupOperationId, isAccepted: boolean) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (isAccepted) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const toggleRegion = (
    id: CleanupRegionOperationId,
    isAccepted: boolean,
  ) => {
    setAcceptedRegions((prev) => {
      const next = new Set(prev);
      if (isAccepted) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const applyAll = () => {
    setAccepted(new Set(cards.map((c) => c.id)));
    setAcceptedRegions(new Set(regionCards.map((c) => c.id)));
  };
  const skipAll = () => {
    setAccepted(new Set());
    setAcceptedRegions(new Set());
  };

  // "By type" = the per-operation cards (the control surface); "Full diff" = the
  // canonical DiffViewer of the actual before→after, reflecting the currently
  // accepted operations live.
  const [mode, setMode] = useState<"cards" | "diff">("cards");

  // The real engine produces the final content from the accepted operations.
  const finalContent = cleanContent(
    report.original,
    accepted,
    acceptedRegions,
  ).cleaned;
  const willWrite = finalContent !== report.original;
  const protectedCount = report.protectedRegions.length;

  const handleApply = () => {
    onApply(finalContent);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[88dvh] w-[92vw] max-w-3xl flex-col gap-0 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* pr-14 clears the Dialog's built-in close (X) button */}
        <DialogHeader className="shrink-0 flex-row items-center gap-2 space-y-0 border-b border-border px-4 py-3 pr-14">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          {/* THE DOOR LAW: this dialog is about to rewrite a specific note and
              named it as flat text with `noteId` sitting right beside it in
              props.

              Doors are SIBLINGS here, not an anchor on the name — and that is
              not stylistic. Every accept/reject decision in this review is local
              `useState`; a same-tab navigation unmounts the dialog and destroys
              all of it with no way back. Peek and new tab answer "which note is
              this?" without costing the user the review. `alwaysShowActions`
              because a dialog header has no hover affordance to discover. */}
          <DialogTitle className="flex min-w-0 items-center gap-1 text-sm">
            <span className="shrink-0">Review changes —</span>
            <span className="truncate">{noteLabel}</span>
            <EntityDoorControls
              token="note"
              id={noteId}
              name={noteLabel}
              alwaysShowActions
              className="shrink-0"
            />
          </DialogTitle>
        </DialogHeader>

        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">
            {cardCount} type{cardCount !== 1 ? "s" : ""} of change ·{" "}
            <span className="text-foreground">{acceptedCount} applied</span>
          </span>
          <div className="flex items-center overflow-hidden rounded-md border border-border">
            <button
              type="button"
              onClick={() => setMode("cards")}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 text-[0.6875rem] transition-colors",
                mode === "cards"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
              title="Review each type of change with an Apply/Skip switch"
            >
              <ListChecks className="h-3.5 w-3.5" />
              By type
            </button>
            <button
              type="button"
              onClick={() => setMode("diff")}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 text-[0.6875rem] transition-colors",
                mode === "diff"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
              title="See the actual before → after of the whole note (canonical diff)"
            >
              <Columns2 className="h-3.5 w-3.5" />
              Full diff
            </button>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[0.6875rem]"
              onClick={applyAll}
              disabled={acceptedCount === cardCount}
            >
              Apply all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[0.6875rem]"
              onClick={skipAll}
              disabled={acceptedCount === 0}
            >
              Skip all
            </Button>
          </div>
        </div>

        {mode === "diff" ? (
          <div className="flex-1 min-h-0 overflow-hidden bg-card">
            {willWrite ? (
              <DiffViewer
                original={report.original}
                modified={finalContent}
                originalLabel="Now"
                modifiedLabel="After cleanup"
                engine="light"
                defaultView="split"
              />
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                Nothing applied — toggle changes back on under “By type”.
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 space-y-2.5 overflow-y-auto bg-textured px-4 py-3">
            {cardCount === 0 ? (
              <div className="rounded-md border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
                No textual changes were produced.
              </div>
            ) : (
              <>
                {regionCards.map((card) => (
                  <CleanupChangeCard
                    key={card.id}
                    card={card}
                    accepted={acceptedRegions.has(card.id)}
                    onToggle={toggleRegion}
                  />
                ))}
                {cards.map((card) => (
                  <CleanupChangeCard
                    key={card.id}
                    card={card}
                    accepted={accepted.has(card.id)}
                    onToggle={toggle}
                  />
                ))}
              </>
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
        )}

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
              {acceptedCount === 0 ? "Nothing applied" : "Apply changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
