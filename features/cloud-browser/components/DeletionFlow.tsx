"use client";

/**
 * DeletionFlow — delete a Cloud Browser, honestly (D-20 retention).
 *
 * Uses the imperative confirm() one-liner (browser window.confirm is banned).
 * Deletion is a durable workflow that keeps 30 days of history so a mistake is
 * recoverable; the copy says exactly that.
 */

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { cn } from "@/utils/cn";
import { Trash2, Loader2 } from "lucide-react";
import { CHECKPOINT_RETENTION_DAYS } from "../constants";
import { startDeletion } from "../service";

export function DeletionFlow({
  profileId,
  profileName,
  canDelete,
  className,
}: {
  profileId: string;
  profileName: string;
  /** Only Full (admin) may delete (S1 §2.17). */
  canDelete: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete "${profileName}"?`,
      description: `This signs out of every account this browser holds and removes its saved state. You have ${CHECKPOINT_RETENTION_DAYS} days to change your mind before it is erased for good.`,
      variant: "destructive",
      confirmLabel: "Delete browser",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await startDeletion(profileId);
      toast.success("Deletion started. You have 30 days to restore this browser.");
    } catch {
      toast.error("Could not start deletion. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!canDelete) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Only someone with full access can delete this browser.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Button variant="destructive" size="sm" onClick={onDelete} disabled={busy} className="self-start">
        {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
        Delete this browser
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Recoverable for {CHECKPOINT_RETENTION_DAYS} days after you start.
      </p>
    </div>
  );
}
