// features/organizations/organizationsIAmIn.ts — LANE GATES-TAIL (VERIFIER-21 #7)
//
// THE ORGANIZATIONS THIS PERSON IS IN — once per session, for the reads that only a member may
// make (a roster, an organization's knobs). Access is personal: a person can be given a table
// of an organization she is not in, and every open of it asked those member-only doors about
// that organization and was refused with 403 (`iam.has_org_access_for`: direct membership).
// Such a read is not hers to make, so it is not asked for. Null when her memberships could not
// be read — the caller then asks as before and lets the door answer.

import { membershipsService } from "@/features/organizations/service/membershipsService";
import { isScopesRpcErr } from "@/features/scopes/types";

let mine: Promise<Set<string> | null> | null = null;

export function organizationsIAmIn(): Promise<Set<string> | null> {
  if (!mine) {
    mine = membershipsService
      .forUser("organization")
      .then((r) => (isScopesRpcErr(r) ? null : new Set(r.data.memberships.map((m) => m.containerId))))
      .catch(() => null);
  }
  return mine;
}

/** False only when her memberships were read and do not include `organizationId`. */
export async function mayReadAsMember(organizationId: string): Promise<boolean> {
  const set = await organizationsIAmIn();
  return set === null || set.has(organizationId);
}

/** Test seam. */
export function __resetOrganizationsIAmInForTest(): void {
  mine = null;
}
