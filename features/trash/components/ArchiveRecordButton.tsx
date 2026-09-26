"use client";

// features/trash/components/ArchiveRecordButton.tsx
//
// THE shared "Archive" control for any registered record Trash lists (archive, never delete —
// Arman 2026-09-20). One confirm with the one archive sentence, one write (`archiveRecord`), and a
// success that names where it comes back from. Mount it wherever a record is shown; never write a
// surface-specific soft delete beside it.

import { useState } from "react";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { archiveConfirmSentence } from "../archiveCopy";
import { archiveRecord, restoreFromTrash } from "../service";

interface ArchiveRecordProps {
  /** Registered entity token (platform.entity_types). */
  token: string;
  id: string;
  /** The thing as a person says it: "this document", `"Kiln log"`. */
  what: string;
  onArchived?: () => void;
  /** It came back through Undo — show it again. */
  onRestored?: () => void;
}

export function ArchiveRecordButton({
  className,
  ...record
}: ArchiveRecordProps & { className?: string }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" className={className ?? "h-7 px-2 text-xs"} onClick={() => setConfirming(true)}>
        <Archive className="mr-1 h-3.5 w-3.5" aria-hidden />
        Archive
      </Button>
      <ArchiveRecordDialog {...record} open={confirming} onOpenChange={setConfirming} />
    </>
  );
}

/**
 * The same confirm + write + undo with NO trigger of its own: for a surface whose
 * existing action set (a page header's actions, a "…" menu) already owns the
 * Archive entry — never a second button beside that set.
 */
export function ArchiveRecordDialog({
  token,
  id,
  what,
  onArchived,
  onRestored,
  open,
  onOpenChange,
}: ArchiveRecordProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      busy={busy}
      onOpenChange={onOpenChange}
      title={`Archive ${what}?`}
      description={archiveConfirmSentence(what)}
      confirmLabel="Archive"
      onConfirm={async () => {
        setBusy(true);
        try {
          await archiveRecord(token, id, what);
          onArchived?.();
          // Said, and undoable right here — the surface has already moved it off screen.
          toast.success(`Archived ${what}. It's in Trash until you restore it.`, {
            action: {
              label: "Undo",
              onClick: () => {
                void restoreFromTrash(token, id)
                  .then(() => { toast.success(`Restored ${what}.`); onRestored?.(); })
                  .catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)));
              },
            },
          });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
          onOpenChange(false);
        }
      }}
    />
  );
}
