"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, Check, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSaveCase, type SaveStep } from "../../state/useSaveCase";
import { evaluateDraftReadiness } from "../../state/buildStatelessPayload";
import type { RatingDraft } from "../../state/types";

interface SaveCaseButtonProps {
  draft: RatingDraft;
  /**
   * True when the draft has unsaved edits relative to its last-persisted
   * baseline. Only consulted in saved-case mode; in draft mode the
   * readiness check (applicant/occupation/earnings) drives enablement.
   */
  isDirty?: boolean;
  /**
   * Called after a successful create. Lets the parent route to the
   * canonical `/[claimId]` URL.
   */
  onSaved?: (claimId: string, reportId: string) => void;
  /**
   * Called after a successful update of an already-persisted case. The
   * parent should clear the dirty flag so the button returns to the
   * "All changes saved" state.
   */
  onUpdated?: (claimId: string, reportId: string) => void;
  redirectAfterLogin?: string;
}

const STEP_LABELS: Record<SaveStep, string> = {
  claim: "Saving claim…",
  report: "Creating report…",
  injuries: "Saving injuries…",
  calculate: "Computing rating…",
};

/**
 * Single explicit save control for both new and existing cases. Picks
 * the right backend flow based on whether the draft is already
 * persisted (`draft.persistedClaimId` is set).
 *
 * - New case (draft mode):   POST claim → report → injuries → calculate
 * - Existing case (saved):   PATCH claim + injury upserts + DELETE
 *                            removed injuries → recalculate
 *
 * In saved mode the button stays enabled when there are no unsaved
 * changes but renders as a passive "All changes saved" badge so the
 * user always sees that explicit save control is available.
 */
export function SaveCaseButton({
  draft,
  isDirty = false,
  onSaved,
  onUpdated,
  redirectAfterLogin,
}: SaveCaseButtonProps) {
  const router = useRouter();
  const { status, save, update, isAuthed } = useSaveCase();
  const readiness = evaluateDraftReadiness(draft);

  const isSavedCase = !!draft.persistedClaimId && !!draft.persistedReportId;
  const isSaving = status.kind === "saving";
  const stepLabel = isSaving ? STEP_LABELS[status.step] : null;

  // Draft mode requires the readiness gate (applicant + occupation +
  // earnings + at least one injury). Saved mode just requires unsaved
  // edits — the case already passed readiness when it was created.
  const disabled = isSaving || (isSavedCase ? !isDirty : !readiness.ready);

  const handleClick = async () => {
    if (!isAuthed) {
      const next =
        redirectAfterLogin ?? "/legal/ca-wc/pd-ratings-calculator?save=1";
      router.push(`/login?redirectTo=${encodeURIComponent(next)}`);
      return;
    }

    if (isSavedCase) {
      const result = await update(draft);
      if (result) {
        toast.success("Changes saved", {
          description: "Case updated and rating refreshed.",
        });
        onUpdated?.(result.claimId, result.reportId);
      }
    } else {
      const result = await save(draft);
      if (result) {
        toast.success("Case saved", {
          description: "Your case has been saved and the rating is persisted.",
        });
        onSaved?.(result.claimId, result.reportId);
      }
    }
  };

  React.useEffect(() => {
    if (status.kind === "error") {
      toast.error("Couldn't save case", { description: status.message });
    }
  }, [status]);

  const button = (
    <Button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      size="sm"
      variant={isSavedCase && !isDirty ? "outline" : "default"}
      className="gap-1.5"
    >
      {isSaving ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {stepLabel}
        </>
      ) : !isAuthed ? (
        <>
          <LogIn className="h-3.5 w-3.5" />
          Sign in to save
        </>
      ) : isSavedCase && !isDirty ? (
        <>
          <Check className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">All changes saved</span>
          <span className="sm:hidden">Saved</span>
        </>
      ) : isSavedCase ? (
        <>
          <Bookmark className="h-3.5 w-3.5" />
          Save changes
        </>
      ) : status.kind === "saved" ? (
        <>
          <BookmarkCheck className="h-3.5 w-3.5" />
          Saved
        </>
      ) : (
        <>
          <Bookmark className="h-3.5 w-3.5" />
          Save case
        </>
      )}
    </Button>
  );

  // The clean-saved state still needs an explanation when hovered so
  // the user knows it's a real button waiting for changes — not just
  // a passive status pill.
  if (isSavedCase && !isDirty && !isSaving) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={-1}>{button}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          No unsaved changes. Edit any field to enable Save.
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
