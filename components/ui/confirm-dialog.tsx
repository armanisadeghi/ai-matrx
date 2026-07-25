"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /**
   * Rich body rendered between the header and the footer, OUTSIDE the
   * description `<p>` — use for block-level content (diffs, previews, lists)
   * that would be invalid HTML inside `description`.
   */
  content?: React.ReactNode;
  /** Extra classes for the dialog content (e.g. a wider max-w for diffs). */
  contentClassName?: string;
  confirmLabel?: string;
  /**
   * `null` hides the cancel button entirely — for acknowledge-only dialogs
   * (e.g. `announceComingSoon`) where there is nothing to cancel. Anything
   * else labels it.
   */
  cancelLabel?: string | null;
  variant?: "default" | "destructive";
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * Drop-in replacement for `window.confirm`. Use this anywhere you would
 * otherwise reach for a browser-level confirm dialog.
 *
 * Pattern: hold the pending target in state, render <ConfirmDialog />
 * once at the bottom of the component, and open it by setting the target.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  content,
  contentClassName,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  busy = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={contentClassName}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {content ?? null}
        <AlertDialogFooter>
          {cancelLabel === null ? null : (
            <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          )}
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
            className={cn(
              variant === "destructive" &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
