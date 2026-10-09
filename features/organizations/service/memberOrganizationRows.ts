// features/organizations/service/memberOrganizationRows.ts — lane PAGE-BUNDLE-2
//
// HER ORGANIZATIONS ARE READ ONCE PER PAGE LOAD, NOT FOUR TIMES.
//
// Every page load read `iam.organizations` for the same person from three places a moment apart —
// the member list (`getUserOrganizations`, once per archive filter), the scope tree's skeleton and
// its whole tree — measured on production at 8 organization calls per page for admin@admin.com.
// They now share ONE read: her memberships, then EVERY organization row she is a member of
// (`select *`, archived included — each caller filters what it shows, as before). Shared while in
// flight and for SHARED_MS after it lands; a write that changes her organizations, or an explicit
// refresh, forgets it (`forgetMemberOrganizationRows`). A failed read is never shared past its flight.

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { membershipsService } from "@/features/organizations/service/membershipsService";
import { readInChunks } from "@/features/scopes/service/inChunks";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { Database } from "@/types/database.types";

export type MemberOrganizationRow = Database["iam"]["Tables"]["organizations"]["Row"];

export type MemberOrganizationRows =
  | { ok: true; roleByOrgId: Map<string, string>; rows: MemberOrganizationRow[] }
  | { ok: false; stage: "memberships"; error: { message: string; code?: string } }
  | { ok: false; stage: "organizations"; error: { message: string; code?: string; details?: string; hint?: string } };

const SHARED_MS = 5_000;
let shared: { userId: string; at: number; read: Promise<MemberOrganizationRows> } | null = null;

async function readOnce(): Promise<MemberOrganizationRows> {
  const memberships = await membershipsService.forUser("organization");
  if (isScopesRpcErr(memberships)) {
    return { ok: false, stage: "memberships", error: { message: memberships.error.message, code: memberships.error.code } };
  }
  const roleByOrgId = new Map<string, string>();
  for (const m of memberships.data.memberships) roleByOrgId.set(m.containerId, m.role);
  const orgIds = [...roleByOrgId.keys()];
  if (orgIds.length === 0) return { ok: true, roleByOrgId, rows: [] };
  // ONE GET url carries ~100 ids, not a person's ~1000 memberships: read in chunks.
  const { data, error } = await readInChunks(orgIds, (chunk) =>
    supabase.schema("iam").from("organizations").select("*").in("id", chunk),
  );
  if (error) {
    const e = error as { message?: string; code?: string; details?: string; hint?: string };
    return { ok: false, stage: "organizations", error: { message: e.message ?? "The organizations could not be read.", code: e.code, details: e.details, hint: e.hint } };
  }
  return { ok: true, roleByOrgId, rows: (data ?? []) as MemberOrganizationRow[] };
}

/** Her memberships and every organization row she is a member of — one read, shared. */
export function readMemberOrganizationRows(): Promise<MemberOrganizationRows> {
  const userId = requireUserId();
  const held = shared;
  if (held && held.userId === userId && (held.at === 0 || Date.now() - held.at < SHARED_MS)) return held.read;
  const entry: { userId: string; at: number; read: Promise<MemberOrganizationRows> } = { userId, at: 0, read: Promise.resolve({ ok: true, roleByOrgId: new Map(), rows: [] }) };
  entry.read = readOnce().then(
    (answer) => {
      if (answer.ok) entry.at = Date.now();
      else if (shared === entry) shared = null;
      return answer;
    },
    (thrown: unknown) => {
      if (shared === entry) shared = null;
      throw thrown;
    },
  );
  shared = entry;
  return entry.read;
}

/** A write that changed her organizations, or a refresh: the next read asks again. */
export function forgetMemberOrganizationRows(): void {
  shared = null;
}
