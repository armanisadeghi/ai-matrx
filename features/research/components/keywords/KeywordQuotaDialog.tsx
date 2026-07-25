"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

import { updateTopic } from "../../service";
import type { QuotaVerdict } from "../../keywordQuota";

/**
 * Shown when adding a keyword would cross a pipeline cap.
 *
 * The caps stay enforced — this dialog never bypasses one. It makes the
 * enforcement VISIBLE and puts the raise in the user's hands, which is the
 * whole difference between "your keyword silently never ran" and an informed
 * choice. When a tier eventually forbids the raise, the update fails here with
 * a real error instead of the work quietly disappearing days later.
 */
export function KeywordQuotaDialog({
  open,
  onOpenChange,
  topicId,
  keywords,
  verdict,
  onResolved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicId: string;
  /** The keyword(s) the user is trying to add — echoed so context is never lost. */
  keywords: string[];
  verdict: QuotaVerdict;
  /**
   * Called after the user decides. `raised` reports whether the caps were
   * lifted, so the caller can proceed with the add either way and tell the
   * truth about what will happen.
   */
  onResolved: (raised: boolean) => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  const handleRaise = async () => {
    setSaving(true);
    try {
      await updateTopic(topicId, verdict.patch);
      onOpenChange(false);
      await onResolved(true);
    } catch (err) {
      // Loud, never swallowed: a failed raise is exactly the tier-limit case
      // this dialog exists to make visible.
      toast.error(
        (err as Error).message ?? "Could not raise the pipeline limits",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddAnyway = async () => {
    onOpenChange(false);
    await onResolved(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            This keyword would not run
          </DialogTitle>
          <DialogDescription className="text-xs">
            {keywords.length === 1 ? (
              <>
                Adding{" "}
                <span className="font-medium text-foreground">
                  “{keywords[0]}”
                </span>{" "}
                puts this topic past a pipeline limit.
              </>
            ) : (
              <>
                Adding {keywords.length} keywords puts this topic past a
                pipeline limit.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {verdict.shortfalls.map((s) => (
            <div
              key={s.key}
              className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">
                  {s.label}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
                  {s.current} → {s.required}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {s.consequence}
              </p>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={handleAddAnyway}
            disabled={saving}
            className="inline-flex items-center justify-center h-8 px-3 rounded-full matrx-glass-card text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          >
            Add without raising
          </button>
          <button
            type="button"
            onClick={handleRaise}
            disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Raise limits and add
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
