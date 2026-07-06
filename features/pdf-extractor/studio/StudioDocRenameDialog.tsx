"use client";

import { useEffect, useState } from "react";
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
import { ProInput } from "@/components/official/ProInput";

export interface StudioDocRenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onCommit: (newName: string) => void | Promise<void>;
}

export function StudioDocRenameDialog({
  open,
  onOpenChange,
  currentName,
  onCommit,
}: StudioDocRenameDialogProps) {
  const [value, setValue] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(currentName);
      setError(null);
    }
  }, [open, currentName]);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Name cannot be empty.");
      return;
    }
    if (trimmed === currentName.trim()) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCommit(trimmed);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rename document</AlertDialogTitle>
          <AlertDialogDescription>
            Updates the extractor title and keeps the backing cloud file in sync
            when one is linked.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ProInput
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          maxLength={200}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSave();
          }}
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={() => void handleSave()}>
            Save
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
