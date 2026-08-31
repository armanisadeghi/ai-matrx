// lib/organizations/globalOwnership.ts
//
// ONE rule for how a GLOBAL row leaves these API routes.
//
// 🚨 WHY THIS EXISTS — the write→read gap that made global shortcut categories
// invisible on production (2026-08-31, v0.4.1588). Every client surface reads
// ownership through the shared scope model in
// `features/agents/redux/shared/scope.ts`, whose entire definition of "global"
// is: NO tenant owner —
//
//     matchesScope(row, {scope:"global"}) ===
//       row.userId === null && row.organizationId === null &&
//       row.projectId === null && row.taskId === null
//
// Storage moved the other way. `platform.categories.organization_id` and the
// shortcut table's are NOT NULL, so the flip homed global/platform content in
// the SYSTEM organization instead of a NULL org. The routes were updated to
// query it (`.eq("organization_id", await resolveSystemOrgId())`) but kept
// echoing the raw system-org id back on the wire — so every row the server
// correctly identified as global arrived at the client wearing an
// organization, and `matchesScope` threw all of them away. Measured on
// production: 55 global shortcut categories in the table, 55 returned to the
// admin by PostgREST, ZERO rendered — which is why no admin shortcut could be
// saved (the Create modal requires a category and its picker was empty) and
// why a freshly created category "never appeared" (it was upserted into the
// store and then filtered out by the same rule).
//
// The class fix is here rather than in ten client call sites because the
// stale rule is not a bug in one selector — `matchesScope`, `resolveRowScope`,
// `selectGlobalCategories`, `selectGlobalShortcuts`, the ownership badges in
// `CategoryTree` / `DuplicateCategoryModal`, the category pickers in
// `ShortcutEditorNext` / `BatchShortcutsEditor` and `format.ts` ALL read
// "global" as "organizationId is null". That is the client's model, it is a
// good model, and the system org is a STORAGE detail that must not cross this
// boundary. These routes already exist to speak the legacy wire shape (see
// `platformCategoryToLegacyRow`); presenting a system-org row as unowned is
// part of that job, not an exception to it.
//
// Writes are unaffected: a global write never echoes a fetched
// `organization_id` back — `resolveShortcutWriteScope` (client) and
// `applyScopeToInsertPayload` (server) both re-resolve the system org from
// `iam.system_orgs` for `scope === "global"`, and the category PATCH route
// ignores a non-string `organization_id`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";

type OwnedRow = { organization_id?: string | null };

/**
 * Present one row the way the client's scope model reads it: a row owned by the
 * system organization is GLOBAL, so it goes out with no organization. Any other
 * org id is a real tenant and passes through untouched.
 */
export function toGlobalOwnershipWire<T extends OwnedRow>(
  row: T,
  systemOrgId: string,
): T {
  if (!row || row.organization_id !== systemOrgId) return row;
  return { ...row, organization_id: null };
}

/** `toGlobalOwnershipWire` over a list. */
export function toGlobalOwnershipWireList<T extends OwnedRow>(
  rows: T[],
  systemOrgId: string,
): T[] {
  return rows.map((row) => toGlobalOwnershipWire(row, systemOrgId));
}

/**
 * Convenience for route handlers that have a Supabase client but no resolved
 * system org id yet. `resolveSystemOrgId` is memoized for the life of the
 * process, so this is at most one extra read per server instance.
 */
export async function projectGlobalOwnership<T extends OwnedRow>(
  rows: T[],
  client: SupabaseClient,
): Promise<T[]> {
  return toGlobalOwnershipWireList(rows, await resolveSystemOrgId(client));
}

type OwnedRecord = { organizationId?: string | null };

/**
 * The same rule for records already converted to the client's camelCase shape —
 * used by the thunks that write straight to the table and put the RETURNED row
 * in the store without a round trip through an API route.
 */
export function toGlobalOwnershipRecord<T extends OwnedRecord>(
  record: T,
  systemOrgId: string,
): T {
  if (!record || record.organizationId !== systemOrgId) return record;
  return { ...record, organizationId: null };
}

/**
 * The inverse, for a write that sends a whole record back to the table. The
 * column is NOT NULL, and "no tenant owner" means the system organization —
 * exactly what `resolveShortcutWriteScope({scope:"global"})` resolves for a
 * fresh write. Use this whenever a record READ through the global-ownership
 * rule is written back verbatim.
 */
export function fromGlobalOwnershipRecord<T extends OwnedRecord>(
  record: T,
  systemOrgId: string,
): T {
  if (!record || record.organizationId) return record;
  return { ...record, organizationId: systemOrgId };
}
