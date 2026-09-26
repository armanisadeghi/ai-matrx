// features/organizations/service/orgMemberRows.ts
//
// THE ONE READ of an organization's member roster
// (`get_organization_members_with_users`). Every caller — the members page, the
// task assignee picker's connections, record stamps, "add everyone in", CRM —
// reads through here, so one page asking for the same roster many times makes
// ONE request: a read in flight is joined, and an answer is reused for 30 s.
// RC-B6 round 2: the task page fired ~60 identical roster requests in 7 s.
//
// Failures are never cached. Anything that changes a roster calls
// `forgetOrganizationMemberRows(orgId)` so the next read is fresh.

import { createClient } from "@/utils/supabase/client";
import { pgErrorToError } from "@ai-matrx/data";
import type { Database } from "@/types/database.types";

export type OrganizationMemberRow =
  Database["public"]["Functions"]["get_organization_members_with_users"]["Returns"][number];

export const MEMBER_ROWS_TTL_MS = 30_000;

interface CacheEntry {
  at: number;
  settled: boolean;
  rows: Promise<OrganizationMemberRow[]>;
}

const cache = new Map<string, CacheEntry>();

type RosterClient = Pick<ReturnType<typeof createClient>, "rpc">;

export function readOrganizationMemberRows(
  orgId: string,
  {
    now = Date.now(),
    fresh = false,
    client,
  }: {
    now?: number;
    /** An explicit refresh: skip a settled answer (an in-flight read is still joined). */
    fresh?: boolean;
    client?: RosterClient;
  } = {},
): Promise<OrganizationMemberRow[]> {
  const hit = cache.get(orgId);
  if (hit && (now - hit.at < MEMBER_ROWS_TTL_MS) && (!fresh || !hit.settled)) return hit.rows;
  const db = client ?? createClient();
  const entry: CacheEntry = { at: now, settled: false, rows: Promise.resolve([]) };
  const rows = (async () => {
    const { data, error } = await db.rpc("get_organization_members_with_users", {
      p_org_id: orgId,
    });
    if (error) throw pgErrorToError(error);
    return (data ?? []) as OrganizationMemberRow[];
  })();
  entry.rows = rows;
  cache.set(orgId, entry);
  rows.then(
    () => {
      entry.settled = true;
    },
    () => {
      if (cache.get(orgId) === entry) cache.delete(orgId);
    },
  );
  return rows;
}

/** A roster changed (role, removal, join, leave): the next read goes to the server. */
export function forgetOrganizationMemberRows(orgId?: string): void {
  if (orgId) cache.delete(orgId);
  else cache.clear();
}
