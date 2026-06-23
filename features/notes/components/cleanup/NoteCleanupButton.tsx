"use client";

// NoteCleanupButton — entry point for content cleanup on a note. A header
// button that opens the opt-in popover (live preview of what will change), and
// on Run hands a frozen report to the review dialog. Drops into NoteViewControls
// or any note header. Reads/writes the note via useNoteCleanup; the engine and
// diff are pure and reusable (lib/content-cleanup).

import { useState } from "react";
import { Eraser } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { cleanContent } from "@/lib/content-cleanup/clean";
import { DEFAULT_ENABLED_OPERATIONS } from "@/lib/content-cleanup/operations";
import type {
  CleanupOperationId,
  CleanupReport,
} from "@/lib/content-cleanup/types";
import { useNoteCleanup } from "./useNoteCleanup";
import { CleanupOptionsPopover } from "./CleanupOptionsPopover";
import { CleanupReviewDialog } from "./CleanupReviewDialog";

export function NoteCleanupButton({
  noteId,
  className,
  triggerClassName,
  triggerActiveClassName,
  showLabel = false,
  label = "Clean up",
}: {
  noteId: string;
  className?: string;
  /** Full base trigger look; overrides the default compact-icon styling. */
  triggerClassName?: string;
  /** Applied (merged) while the popover is open, paired with triggerClassName. */
  triggerActiveClassName?: string;
  showLabel?: boolean;
  label?: string;
}) {
  const { content, label, apply } = useNoteCleanup(noteId);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [enabled, setEnabled] = useState<Set<CleanupOperationId>>(
    () => new Set(DEFAULT_ENABLED_OPERATIONS),
  );
  const [run, setRun] = useState<{ report: CleanupReport; id: number } | null>(
    null,
  );
  const [reviewOpen, setReviewOpen] = useState(false);

  const hasContent = content.trim().length > 0;

  // Live preview while the popover is open (compiler-memoized on content/enabled).
  let preview: CleanupReport | null = null;
  if (popoverOpen && hasContent) {
    try {
      preview = cleanContent(content, enabled);
    } catch (err) {
      console.error("[note-cleanup] preview failed", err);
      preview = null;
    }
  }

  const onToggle = (id: CleanupOperationId, on: boolean) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const onResetDefaults = () =>
    setEnabled(new Set(DEFAULT_ENABLED_OPERATIONS));

  const onRun = () => {
    if (!preview || !preview.changed) {
      toast.info("Nothing to clean up");
      return;
    }
    setRun((prev) => ({ report: preview as CleanupReport, id: (prev?.id ?? 0) + 1 }));
    setPopoverOpen(false);
    setReviewOpen(true);
  };

  const handleApply = (finalContent: string): boolean => {
    const wrote = apply(finalContent);
    if (wrote) toast.success("Note cleaned up");
    else toast.info("No changes applied");
    return wrote;
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Clean up content"
            disabled={!hasContent}
            className={cn(
              triggerClassName ??
                cn(
                  "flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-[0.6875rem] font-medium transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5",
                  popoverOpen
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                ),
              triggerClassName && popoverOpen && triggerActiveClassName,
              "disabled:cursor-not-allowed disabled:opacity-40",
              className,
            )}
          >
            <Eraser />
            {showLabel && <span>{label}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <CleanupOptionsPopover
            enabled={enabled}
            onToggle={onToggle}
            preview={preview}
            onRun={onRun}
            onResetDefaults={onResetDefaults}
          />
        </PopoverContent>
      </Popover>

      {run && (
        <CleanupReviewDialog
          key={run.id}
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          report={run.report}
          noteId={noteId}
          noteLabel={label}
          onApply={handleApply}
        />
      )}
    </>
  );
}
