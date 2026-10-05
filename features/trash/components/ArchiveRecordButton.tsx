"use client";

// features/trash/components/ArchiveRecordButton.tsx
//
// THE shared "Archive" control for any registered record Trash lists (archive, never delete —
// Arman 2026-09-20). Archiving is reversible, so it ACTS AT ONCE (Arman, 2026-10-02 — the
// destructive-click law exempts what is clearly undoable): one write (`archiveRecord`), then the
// platform's reversible-action announcement (`lib/reversible`) — Undo, ⌘Z, and where it went
// (Trash), taught the first time and quieter after. Mount it wherever a record is shown; never
// write a surface-specific soft delete beside it.

import { useEffect, useRef, useState } from "react";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { announceReversible } from "@/lib/reversible/announceReversible";
import { TRASH_HREF } from "../archiveCopy";
import { archiveRecord, restoreFromTrash } from "../service";

interface ArchiveRecordProps {
  /** Registered entity token (platform.entity_types). */
  token: string;
  id: string;
  /** The thing as a person says it: "this document", `"Kiln log"`. */
  what: string;
  /** The kind of thing, as a person says it ("document", "note"). Defaults to the token's words. */
  noun?: string;
  onArchived?: () => void;
  /** It came back through Undo — show it again. */
  onRestored?: () => void;
}

/** `"Kiln log"` → `Kiln log` — the announcement adds its own quotes. */
function subjectOf(what: string): string {
  return what.trim().replace(/^["\u201c](.*)["\u201d]$/, "$1");
}

/**
 * Archive one record now and announce it. Resolves true when it was archived; a refusal is said in
 * a toast and resolves false (nothing was archived, so there is nothing to undo).
 */
export async function archiveRecordReversibly({
  token,
  id,
  what,
  noun,
  onArchived,
  onRestored,
}: ArchiveRecordProps): Promise<boolean> {
  try {
    await archiveRecord(token, id, what);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e));
    return false;
  }
  onArchived?.();
  announceReversible({
    verb: "archive",
    noun: noun ?? token.replace(/_/g, " "),
    subject: subjectOf(what),
    undo: async () => {
      await restoreFromTrash(token, id);
      onRestored?.();
    },
    foundAt: { label: "Trash", href: TRASH_HREF },
  });
  return true;
}

export function ArchiveRecordButton({
  className,
  ...record
}: ArchiveRecordProps & { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      icon={<Archive aria-hidden />}
      variant="quiet"
      className={className ?? "h-7 px-2 text-xs"}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void archiveRecordReversibly(record).finally(() => setBusy(false));
      }}
    >
      Archive
    </Button>
  );
}

/**
 * The same archive-and-announce with NO trigger of its own: for a surface whose existing action set
 * (a page header's actions, a "…" menu) already owns the Archive entry — never a second button
 * beside that set. Setting `open` archives at once (there is no dialog: archiving is undoable) and
 * hands `open` back as false.
 */
export function ArchiveRecordDialog({
  open,
  onOpenChange,
  ...record
}: ArchiveRecordProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  // One archive per opening: set when `open` turns true, cleared only when it turns false again.
  const handled = useRef(false);
  useEffect(() => {
    if (!open) {
      handled.current = false;
      return;
    }
    if (handled.current) return;
    handled.current = true;
    void archiveRecordReversibly(record).finally(() => onOpenChange(false));
  }, [open, record, onOpenChange]);
  return null;
}
