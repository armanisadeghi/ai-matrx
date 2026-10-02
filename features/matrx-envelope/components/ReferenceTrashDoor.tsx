"use client";

/**
 * THE DOOR OF A RECORD IN THE TRASH (G6A review, 2026-10-02) — what a chip that
 * names a trashed record opens instead of the in-place window, whose read hides
 * trashed rows and answered "We couldn't open this task…" with nowhere to go.
 *
 * Nothing here is new: the dialog wraps the access gate (`AccessDenied`), which
 * already says a trashed record is "in Trash", offers Restore through Trash's
 * ONE restore door (`restoreFromTrash` → `entity_undelete`) to whoever may
 * restore it, and names who can when the reader may not; its way out is the
 * record's parent, else Trash. A restore bumps the record's version
 * (`invalidateReferenceLabel`), so every chip naming it re-reads and opens it
 * live again.
 */

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { AccessDenied } from "@/features/access-gate/components/AccessDenied";
import { TRASH_HREF } from "@/features/trash/archiveCopy";
import { invalidateReferenceLabel } from "@/features/matrx-envelope/referenceResolvers";

export function ReferenceTrashDoor({
  token,
  id,
  name,
  onClose,
}: {
  token: string;
  id: string;
  name: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-lg p-0" data-reference-trash-door="">
        <DialogTitle className="sr-only">{name}</DialogTitle>
        <AccessDenied
          token={token}
          id={id}
          fallbackHref={TRASH_HREF}
          fallbackLabel="Open Trash"
          onRetry={() => {
            invalidateReferenceLabel(id);
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
