// features/organizations/organizationsIAmIn.ts — LANE GATES-TAIL (VERIFIER-21 #7)
//
// THE ORGANIZATIONS THIS PERSON IS IN — once per session, for the reads that only a member may
// make (a roster, an organization's knobs). Access is personal: a person can be given a table
// of an organization she is not in, and every open of it asked those member-only doors about
// that organization and was refused with 403 (`iam.has_org_access_for`: direct membership).
// Such a read is not hers to make, so it is not asked for. Null when her memberships could not
// be read — the caller then asks as before and lets the door answer.

import { readMemberOrganizationRows } from "@/features/organizations/service/memberOrganizationRows";

let mine: Promise<Set<string> | null> | null = null;

// AN ARCHIVED ORGANIZATION IS NOT ONE SHE IS IN (2026-10-08). Her membership rows
// are kept when an organization is archived (so a restore gives everything back),
// but `iam.has_org_access_for` closes it — every member-only door refuses it with
// 403. Counting those rows made /education/kits ask `context_tree_types` once per
// archived organization: 100 refusals per load for the test admin. Only an
// organization whose row she can read AND that is not archived counts.
export function organizationsIAmIn(): Promise<Set<string> | null> {
  if (!mine) {
    mine = readMemberOrganizationRows()
      .then((r) => (r.ok ? new Set(r.rows.filter((row) => !row.archived_at).map((row) => row.id)) : null))
      .catch(() => null);
  }
  return mine;
}

/** False only when her memberships were read and do not include `organizationId`. */
export async function mayReadAsMember(organizationId: string): Promise<boolean> {
  const set = await organizationsIAmIn();
  return set === null || set.has(organizationId);
}

/**
 * Ask a member-only door ONLY when she is a member of `organizationId`; otherwise
 * answer `otherwise` without a request. Used for reads keyed by a RECORD's
 * organization (a record page's custom fields, its record chat): a record shared
 * with her from an organization she is not in asked `platform.unified_data_store_on`
 * and drew a 403 on every load (page-pass 2026-09-27, /crm/<id>).
 */
export async function askAsMember<T>(
  organizationId: string | null | undefined,
  ask: () => Promise<T>,
  otherwise: T,
): Promise<T> {
  if (organizationId && !(await mayReadAsMember(organizationId))) return otherwise;
  return ask();
}

/** Test seam. */
export function __resetOrganizationsIAmInForTest(): void {
  mine = null;
}
