// lib/list-scope/teamReach.ts
//
// "My team" for a list that reads a TABLE directly (PostgREST), not through a
// `*_list_scoped` RPC. The RPCs narrow with `iam.my_team_reach` in SQL; this is
// the same answer for the client: (organization, person) pairs where the person
// shares a live team with the signed-in person in that organization, the
// person themselves included; an organization where they are on no team
// contributes nothing, so a person on no team gets an empty reach and the
// list says there is no team (2026-09-28). A team is a list filter, never row security — see
// common-docs /systems/platform/teams/FEATURE.md.

import { supabase } from "@/utils/supabase/client";

export interface TeamReachPair {
  organizationId: string;
  userId: string;
}

/** The signed-in person's team reach — in one organization, or (null) all of theirs. */
export async function fetchMyTeamReach(
  organizationId: string | null,
): Promise<TeamReachPair[]> {
  const { data, error } = await supabase.rpc("my_teammates", {
    p_organization_id: organizationId ?? undefined,
  });
  if (error) throw new Error(`Your teams could not be read: ${error.message}`);
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id,
    userId: row.user_id,
  }));
}

/**
 * A PostgREST `.or()` filter string selecting exactly the reach's rows, or null
 * when the reach is empty (the caller returns no rows). Organizations where the
 * person is on no team collapse into one clause, so a person in fifty
 * organizations does not send fifty.
 */
export function teamReachOrFilter(
  reach: readonly TeamReachPair[],
  selfId: string,
  columns: { ownerColumn?: string; orgColumn?: string } = {},
): string | null {
  const owner = columns.ownerColumn ?? "created_by";
  const org = columns.orgColumn ?? "organization_id";
  const byOrg = new Map<string, Set<string>>();
  for (const pair of reach) {
    const users = byOrg.get(pair.organizationId) ?? new Set<string>();
    users.add(pair.userId);
    byOrg.set(pair.organizationId, users);
  }
  const selfOnly: string[] = [];
  const clauses: string[] = [];
  for (const [orgId, users] of byOrg) {
    if (users.size === 1 && users.has(selfId)) {
      selfOnly.push(orgId);
      continue;
    }
    clauses.push(`and(${org}.eq.${orgId},${owner}.in.(${[...users].join(",")}))`);
  }
  if (selfOnly.length > 0) {
    clauses.push(`and(${owner}.eq.${selfId},${org}.in.(${selfOnly.join(",")}))`);
  }
  return clauses.length > 0 ? clauses.join(",") : null;
}
