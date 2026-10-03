/**
 * lib/working-copy/announce.ts — what a working-copy kind says when no editor
 * may be on screen: a conflict that waits for the person's choice, a save
 * that keeps failing. Kept beside the primitive (which stays a leaf) so every
 * kind announces the same way, with the same choice.
 */

import { toast } from "@/lib/toast";
import { mergeText } from "./mergeText";
import type { WorkingCopyKind } from "./workingCopyKind";
import type { WorkingCopyConflict, WorkingCopyEntry } from "./workingCopySlice";

/** The merged text for a text conflict, or null when the edits overlap (or it is not text). */
export function mergedConflictText(entry: WorkingCopyEntry | undefined): string | null {
  const conflict = entry?.conflict;
  if (!entry || !conflict || entry.value === undefined) return null;
  if (conflict.theirs === undefined || conflict.ancestor === undefined) return null;
  return mergeText(conflict.ancestor, entry.value, conflict.theirs);
}

const conflictToastId = <E>(kind: WorkingCopyKind<E>, id: string) => `working-copy-conflict:${kind.key(id)}`;

/**
 * A conflict opened: a toast that stays until the person chooses (the
 * record's editor shows the same choice — `WorkingCopyAlert`).
 */
export function announceWorkingCopyConflict<E>(
  kind: WorkingCopyKind<E>,
  id: string,
  noun: string,
  _conflict: WorkingCopyConflict,
): void {
  const merged = mergedConflictText(kind.entry(id));
  const choose = (choice: "mine" | "theirs" | "merge") => {
    void kind.resolveConflict(id, choice, choice === "merge" ? (merged ?? undefined) : undefined);
  };
  toast.warning(`${noun} changed elsewhere`, {
    id: conflictToastId(kind, id),
    duration: Infinity,
    description: "Your unsaved edit is kept until you choose.",
    action:
      merged !== null
        ? { label: "Merge", onClick: () => choose("merge") }
        : { label: "Keep mine", onClick: () => choose("mine") },
    cancel: { label: "Take theirs", onClick: () => choose("theirs") },
  });
}

/** The conflict was resolved (here or in an editor): its toast goes. */
export function dismissWorkingCopyConflict<E>(kind: WorkingCopyKind<E>, id: string): void {
  toast.dismiss(conflictToastId(kind, id));
}
