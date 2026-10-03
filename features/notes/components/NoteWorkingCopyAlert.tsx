"use client";

/**
 * The note's working-copy choice inside a note editor: the stored note moved
 * under unsaved words (Merge · Keep mine · Take theirs), or a save failed for
 * good (Retry · Discard). The same row every working-copy record shows
 * (`WorkingCopyAlert`); nothing renders when there is nothing to decide.
 */

import { WorkingCopyAlert } from "@/lib/working-copy/WorkingCopyAlert";
import { noteWorkingCopy } from "../utils/noteLiveContent";

export function NoteWorkingCopyAlert({ noteId, className }: { noteId: string; className?: string }) {
  return <WorkingCopyAlert kind={noteWorkingCopy} id={noteId} className={className} />;
}
