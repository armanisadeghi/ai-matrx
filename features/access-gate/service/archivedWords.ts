/**
 * THE ARCHIVED RECORD, SAID HONESTLY (page-pass 2026-09-27, /chat/message-templates/<id>).
 *
 * `access_denied_context` answers `deleted` only when the row still EXISTS with
 * `deleted_at` stamped — a row that is truly gone answers `missing`. So every
 * `deleted` answer is a record sitting in Trash that can come back. The screen
 * used to say "This template was deleted … It was removed, so there's nothing
 * here to open" — a lie by the platform's own archive rule (archive, never
 * delete; an archive without a restore is a lie — `features/trash/archiveCopy.ts`).
 *
 * Who may restore: the generic door `entity_undelete(token, id)` needs edit
 * access, which on a stamped row the resolver reports as ownership (the row's
 * own read policy usually hides stamped rows, so `level` drops to none) or an
 * edit/admin level. Anyone else is told who can bring it back — never shown a
 * Restore control that the store would refuse.
 */
import type { AccessDeniedContext } from "@/features/access-gate/types";

export function mayRestoreArchived(context: AccessDeniedContext): boolean {
  if (context.status !== "deleted") return false;
  return context.isOwner || context.level === "edit" || context.level === "admin";
}

export function archivedHeadline(context: AccessDeniedContext): string {
  return `This ${context.entity.label.toLowerCase()} is in Trash`;
}

// ONE WORD FOR ONE STATE (list-shell fix D, 2026-09-28): the headline said
// "in Trash" and the next line "archived". The word a person sees is Trash —
// "in Trash", "Move to Trash", "Restore"; "archived" stays an engineering word.
export function archivedExplanation(context: AccessDeniedContext): string {
  if (mayRestoreArchived(context)) {
    return "Nothing in it was erased. Restore it to open it again — everything in it comes back.";
  }
  const holder = context.owner?.displayName ?? context.organization?.name ?? null;
  return holder
    ? `Nothing in it was erased. ${holder} can restore it from Trash.`
    : "Nothing in it was erased. Whoever moved it to Trash can restore it.";
}
