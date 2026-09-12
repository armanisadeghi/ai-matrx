// features/settings/universal/scopeRows.ts
//
// The SUB-ORGANIZATION rungs a person can stand inside on the settings
// surface: employer profile, brand, pay group, site, location. Each is a
// `platform.knob_scope_kind` row with a `scope_table`; a value at that rung is
// keyed by a row of that table. The universal UI lets a person pick the row
// they mean ("this pay group", "this site") and passes it to `knob_index` as
// `p_scopes` — the same way a brand's own settings page passes its brand — so
// every rung a registry row names is one a human can actually reach
// (`check:settings-ladder-ui`).
//
// Reads are client-direct under the caller's JWT; RLS on each table decides
// what they may see. The table and label column per kind are fixed here
// because `knob_scope_kind` names the table but not which column is the name.

import { createClient } from "@/utils/supabase/client";
import type { KnobScopeKindName } from "@/lib/scoped-config/types";

export type SubOrgScopeKind = Exclude<KnobScopeKindName, "organization" | "user" | "device">;

/**
 * Every sub-org rung the universal UI offers a picker for, with where its rows
 * live and what to call one (mirrors platform.knob_scope_kind). This list IS
 * the surface's promise: a rung listed here is addressed on the read and
 * offered as a picker; `check:settings-ladder-ui` reads it from disk.
 */
export const SUB_ORG_SCOPE_SOURCES = [
  { kind: "employer_profile", schema: "hr", table: "employer_profile", labelColumn: "legal_name", noun: "Employer profile" },
  { kind: "brand", schema: "web", table: "brand", labelColumn: "name", noun: "Brand" },
  { kind: "pay_group", schema: "hr", table: "pay_group", labelColumn: "name", noun: "Pay group" },
  { kind: "site", schema: "web", table: "site", labelColumn: "name", noun: "Site" },
  { kind: "location", schema: "hr", table: "location", labelColumn: "name", noun: "Location" },
] as const satisfies readonly {
  kind: SubOrgScopeKind;
  schema: "hr" | "web";
  table: string;
  labelColumn: string;
  noun: string;
}[];

export const SUB_ORG_SCOPE_KINDS: readonly SubOrgScopeKind[] = SUB_ORG_SCOPE_SOURCES.map(
  (source) => source.kind,
);

export function isSubOrgScopeKind(kind: string): kind is SubOrgScopeKind {
  return (SUB_ORG_SCOPE_KINDS as readonly string[]).includes(kind);
}

function sourceFor(kind: SubOrgScopeKind) {
  const source = SUB_ORG_SCOPE_SOURCES.find((entry) => entry.kind === kind);
  if (!source) throw new Error(`No scope source for rung ${kind}`);
  return source;
}

export function scopeKindNoun(kind: SubOrgScopeKind): string {
  return sourceFor(kind).noun;
}

export type ScopeRow = { id: string; label: string };

/** The rows of one sub-org rung inside an organization, RLS-limited. */
export async function fetchScopeRows(
  kind: SubOrgScopeKind,
  organizationId: string,
): Promise<ScopeRow[]> {
  const source = sourceFor(kind);
  const supabase = createClient();
  const { data, error } = await supabase
    .schema(source.schema)
    .from(source.table as never)
    .select(`id, ${source.labelColumn}` as "*")
    .eq("organization_id" as never, organizationId as never)
    .is("deleted_at" as never, null)
    .order(source.labelColumn as never, { ascending: true })
    .limit(500);
  if (error) throw new Error(`${source.schema}.${source.table} read failed: ${error.message}`);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    label: String(row[source.labelColumn] ?? row.id),
  }));
}
