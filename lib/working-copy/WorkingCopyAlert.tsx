"use client";

/**
 * WorkingCopyAlert — the record's open conflict (and a save that failed for
 * good) with the person's choice, inside any editor that is a view of a
 * working copy. One row; renders nothing when there is nothing to decide.
 *
 *   conflict  → Merge (when both edits fit) · Keep mine · Take theirs
 *   permanent → Retry · Discard
 */

import { AlertTriangle } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { mergedConflictText } from "./announce";
import type { ConflictChoice, WorkingCopyKind } from "./workingCopyKind";
import { selectWorkingCopy } from "./workingCopySlice";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export interface WorkingCopyAlertProps<E> {
  kind: WorkingCopyKind<E>;
  id: string;
  /** false: the host already shows the failure and its Save / Discard. */
  showFailure?: boolean;
  className?: string;
}

const buttonClass =
  "inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium hover:bg-accent";

export function WorkingCopyAlert<E>({ kind, id, showFailure = true, className }: WorkingCopyAlertProps<E>) {
  const entry = useAppSelector((state) => selectWorkingCopy(state, kind.key(id)));
  if (!entry) return null;

  if (entry.conflict) {
    const merged = mergedConflictText(entry);
    const choose = (choice: ConflictChoice) =>
      void kind.resolveConflict(id, choice, choice === "merge" ? (merged ?? undefined) : undefined);
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs",
          className,
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="font-medium text-foreground">Changed elsewhere</span>
        <span className="flex-1" />
        {merged !== null ? (
          <button type="button" className={buttonClass} onClick={() => choose("merge")}>
            Merge
          </button>
        ) : null}
        <button type="button" className={buttonClass} onClick={() => choose("mine")}>
          Keep mine
        </button>
        <button type="button" className={buttonClass} onClick={() => choose("theirs")}>
          Take theirs
        </button>
      <ErrorAlchemyMenu /></div>
    );
  }

  if (showFailure && entry.failure?.permanent) {
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-wrap items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive-ink",
          className,
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Not saved: {entry.saveError}</span>
        <button type="button" className={buttonClass} onClick={() => void kind.retry(id)}>
          Retry
        </button>
        <button type="button" className={buttonClass} onClick={() => kind.discard(id)}>
          Discard
        </button>
      <ErrorAlchemyMenu /></div>
    );
  }

  return null;
}
