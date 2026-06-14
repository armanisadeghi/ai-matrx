/**
 * features/page-extraction/components/RerunPromptDialog.tsx
 *
 * Three-way prompt shown when the user re-runs a template that has already
 * been run (in state or persisted in the DB). Re-running silently used to
 * pile a second run's rows on top of the first and clobber the in-memory
 * chunk view — destroying the connection to the original run. This makes the
 * choice explicit:
 *
 *   • Replace      — clear the template's previous results, then run again
 *                    into the same template.
 *   • Run as new   — duplicate the template as "<name> (2)" and run that,
 *                    leaving the original run's data fully intact.
 *   • Cancel       — do nothing.
 */

"use client";

import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type RerunBusyAction = "replace" | "addNew" | null;

export interface RerunPromptDialogProps {
  open: boolean;
  jobName: string;
  /** The name the "Run as new" branch will create, e.g. "Invoices (2)". */
  newName: string;
  busyAction: RerunBusyAction;
  onReplace: () => void;
  onAddNew: () => void;
  onCancel: () => void;
}

export function RerunPromptDialog({
  open,
  jobName,
  newName,
  busyAction,
  onReplace,
  onAddNew,
  onCancel,
}: RerunPromptDialogProps) {
  const busy = busyAction !== null;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Run this extraction again?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{jobName}</span> has
            already been run. Choose how to handle the new run so you don&apos;t
            lose the previous one.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 text-[12px] text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Replace</span> clears
            this template&apos;s previous results, then runs again into the same
            template.
          </p>
          <p>
            <span className="font-medium text-foreground">Run as new</span>{" "}
            keeps the previous run untouched and creates{" "}
            <span className="font-mono text-foreground">{newName}</span> for
            this run.
          </p>
        </div>

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="outline" onClick={onAddNew} disabled={busy}>
            {busyAction === "addNew" ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : null}
            Run as new
          </Button>
          <Button variant="destructive" onClick={onReplace} disabled={busy}>
            {busyAction === "replace" ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : null}
            Replace
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
