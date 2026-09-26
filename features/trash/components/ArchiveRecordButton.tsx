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
import { archiveRecord } from "../service";

export function ArchiveRecordButton({
  token,
  id,
  what,
  onArchived,
  className,
}: {
  /** Registered entity token (platform.entity_types). */
  token: string;
  id: string;
  /** The thing as a person says it: "this document", `"Kiln log"`. */
  what: string;
  onArchived?: () => void;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" className={className ?? "h-7 px-2 text-xs"} disabled={busy} onClick={() => setConfirming(true)}>
        <Archive className="mr-1 h-3.5 w-3.5" aria-hidden />
        Archive
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Archive ${what}?`}
        description={archiveConfirmSentence(what)}
        confirmLabel="Archive"
        onConfirm={async () => {
          setBusy(true);
          try {
            await archiveRecord(token, id, what);
            toast.success(`Archived. You can restore ${what} from Trash.`);
            onArchived?.();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
            setConfirming(false);
          }
        }}
      />
    </>
  );
}
