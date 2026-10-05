"use client";

// An archived Source shows STATE, not a sentence: an "Archived" label and a Restore button that
// brings the record back through the one restore primitive (`restoreFromTrash` →
// `entity_undelete`), after which the host re-measures and the Source is usable again.
//
// The server decides who hears "archived" (aidream `conversation_context/archived_reason.py`, one
// rule for every Source kind): the owner, or anyone who could read it anyway. Everyone else hears
// "no_access", so this control never appears for a record the person may not restore.
//
// `reason` joins the manifest entry type in the @ai-matrx/agents release after 0.21.27; the
// intersection keeps this file compiling against the installed version until that is adopted.

import { useState } from "react";
import { ArchiveRestore, Loader2 } from "lucide-react";
import type { SourceManifestEntry } from "@ai-matrx/agents/sources";
import { Button } from "@/components/ui/button";
import { restoreFromTrash } from "@/features/trash/service";
import { toast } from "@/lib/toast";
import { cn } from "@/utils/cn";

type EntryWithReason = SourceManifestEntry & { reason?: string | null };

/** True when the server said this Source is archived (and that this person may restore it). */
export function isArchivedSource(entry: SourceManifestEntry | null | undefined): boolean {
  return (entry as EntryWithReason | null | undefined)?.reason === "archived";
}

/** The status word for an archived Source, beside its siblings ("Ready", "Not available", …). */
export const ARCHIVED_SOURCE_LABEL = "Archived";

/** Source refs name a stored file by older spellings too; restore takes the kernel's token. */
const RESTORE_TOKEN_ALIASES: Record<string, string> = { cld_file: "file", files: "file" };

export function RestoreSourceButton({
  resourceType,
  resourceId,
  onRestored,
  className,
}: {
  resourceType: string;
  resourceId: string;
  /** Re-measure the Sources: the restored record is read again like any other. */
  onRestored: () => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    setBusy(true);
    try {
      await restoreFromTrash(RESTORE_TOKEN_ALIASES[resourceType] ?? resourceType, resourceId);
      toast.success("Restored");
      onRestored();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      icon={busy ? <Loader2 className="animate-spin" /> : <ArchiveRestore />}
      type="button"
      variant="outline"
      className={className}
      disabled={busy}
      onClick={() => void restore()}
    >
      Restore
    </Button>
  );
}
