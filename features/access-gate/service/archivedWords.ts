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

export function archivedExplanation(context: AccessDeniedContext): string {
  if (mayRestoreArchived(context)) {
    return "It was archived, not erased. Restore it to open it again — everything in it comes back.";
  }
  const holder = context.owner?.displayName ?? context.organization?.name ?? null;
  return holder
    ? `It was archived, not erased. ${holder} can restore it from Trash.`
    : "It was archived, not erased. Whoever archived it can restore it from Trash.";
}
