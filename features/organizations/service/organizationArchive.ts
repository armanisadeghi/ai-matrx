/**
 * organizationArchive — AN ORGANIZATION IS ARCHIVED, NEVER DELETED.
 *
 * THE OWNER'S RULING, 2026-09-20, verbatim:
 *
 *   "Deleting anything important in our system should be a soft-delete. I'm
 *    pretty sure we've already set that for many tables. We certainly would not
 *    delete organizations directly. It's absolutely an archive and we would
 *    store it for much more than 30 days just in case. The only reason we limit
 *    anything to 30 days is to comply with some policies for retention.
 *    so... YES."
 *
 * WHAT ARCHIVING DOES. It CLOSES the organization: its members lose access at
 * once, nothing bound to it fires again, and every row inside it stays exactly
 * where it is. It is enforced in ONE place — `iam.my_orgs()`, the question the
 * platform's 730 row-level-security policies ask — so an archived organization
 * simply stops being one of yours everywhere at the same instant, in every
 * client and through every door. Restore puts it back, whole, with no window
 * and no expiry. There is no purge: retention is a platform knob whose default
 * is "keep forever".
 *
 * NOTHING HERE DECIDES ANYTHING. `iam.organization_archive` and
 * `iam.organization_restore` do: owner-or-super-admin, the organization's name
 * typed back character for character, one audit row each, and an answer that is
 * already a sentence. This module carries that sentence to the screen and never
 * paraphrases a refusal.
 */

import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@ai-matrx/data";

/** THE ARCHIVED-ITEMS LAW's three values, and no fourth. */
export type OrganizationArchiveFilter = "active" | "archived" | "all";

/** What one organization's archive looks like, in the door's own words. */
export interface OrganizationArchiveState {
  /** False when this person may not be told anything about this organization. */
  known: boolean;
  archived: boolean;
  archivedAt: string | null;
  /** The person who archived it, by name — null when nobody recorded. */
  archivedByName: string | null;
  reason: string | null;
  /** Whether THIS person may restore it (owner or super admin). */
  mayRestore: boolean;
  /** The banner sentence, already written. Null when it is not archived. */
  sentence: string | null;
}

export interface OrganizationArchiveOutcome {
  archived: boolean;
  /** False when the door found nothing to do (already archived, already live). */
  changed: boolean;
  /** What to show the person — the door's own sentence, never a rewrite. */
  sentence: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function outcomeFrom(value: unknown): OrganizationArchiveOutcome {
  const row = asRecord(value);
  return {
    archived: row.archived === true,
    changed: row.changed === true,
    sentence: typeof row.sentence === "string" ? row.sentence : "",
  };
}

/**
 * Archive an organization. The caller must be its owner (or a super admin) and
 * must have typed the organization's name back exactly.
 *
 * A refusal arrives as a thrown Error whose message is already the door's
 * sentence — show it as it is.
 */
export async function archiveOrganization(
  organizationId: string,
  confirmName: string,
  reason: string | null,
): Promise<OrganizationArchiveOutcome> {
  const { data, error } = await supabase.schema("iam").rpc(
    "organization_archive",
    {
      p_org: organizationId,
      p_confirm_name: confirmName,
      p_reason: reason && reason.trim() ? reason.trim() : null,
    },
  );
  if (error) throw pgErrorToError(error);
  return outcomeFrom(data);
}

/** Reopen an archived organization. Same authority, same typed name, no expiry. */
export async function restoreOrganization(
  organizationId: string,
  confirmName: string,
): Promise<OrganizationArchiveOutcome> {
  const { data, error } = await supabase
    .schema("iam")
    .rpc("organization_restore", {
      p_org: organizationId,
      p_confirm_name: confirmName,
    });
  if (error) throw pgErrorToError(error);
  return outcomeFrom(data);
}

/**
 * What the archived organization's own settings page shows in its banner: is it
 * archived, who did it, when, why, and may this person put it back.
 *
 * It never throws for an ordinary read failure — a banner that cannot be read
 * is simply not shown, and the page below it is unchanged.
 */
export async function organizationArchiveState(
  organizationId: string,
): Promise<OrganizationArchiveState | null> {
  const { data, error } = await supabase
    .schema("iam")
    .rpc("organization_archive_state", { p_org: organizationId });
  if (error) {
    console.error(
      "Error reading the organization's archive state:",
      pgErrorToError(error),
    );
    return null;
  }
  const row = asRecord(data);
  if (row.known !== true) return null;
  return {
    known: true,
    archived: row.archived === true,
    archivedAt: typeof row.archived_at === "string" ? row.archived_at : null,
    archivedByName:
      typeof row.archived_by_name === "string" ? row.archived_by_name : null,
    reason: typeof row.reason === "string" ? row.reason : null,
    mayRestore: row.may_restore === true,
    sentence: typeof row.sentence === "string" ? row.sentence : null,
  };
}
