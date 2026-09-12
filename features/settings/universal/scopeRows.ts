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
// Reads go through ONE door, `platform.knob_scope_rows` (aidream migration
// 0639), client-direct under the caller's JWT. They cannot read the rung's own
// table: only `public` and `platform` are exposed to PostgREST, so
// `supabase.schema("hr").from("location")` answers "Invalid schema: hr" and
// every picker stood permanently empty. The door is driven by
// `platform.knob_scope_kind`'s own `scope_schema`/`scope_table`, so a new rung
// needs no new code here — only the noun a person reads.

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
  { kind: "employer_profile", noun: "Employer profile" },
  { kind: "brand", noun: "Brand" },
  { kind: "pay_group", noun: "Pay group" },
  { kind: "site", noun: "Site" },
  { kind: "location", noun: "Location" },
] as const satisfies readonly {
  kind: SubOrgScopeKind;
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

type ScopeRowsResult =
  | { ok: true; kind: string; rows: ScopeRow[] }
  | { ok: false; reason: string; detail?: string };

/**
 * The rows of one sub-org rung inside an organization, membership-gated in the
 * door. A refusal is thrown with the sentence the door carries — the picker
 * shows it rather than an empty list that says nothing.
 */
export async function fetchScopeRows(
  kind: SubOrgScopeKind,
  organizationId: string,
): Promise<ScopeRow[]> {
  const noun = scopeKindNoun(kind).toLowerCase();
  const supabase = createClient();
  const { data, error } = await supabase.schema("platform").rpc("knob_scope_rows", {
    p_organization_id: organizationId,
    p_kind: kind,
  });
  if (error) throw new Error(`knob_scope_rows(${noun}) failed: ${error.message}`);
  const result = (data ?? null) as unknown as ScopeRowsResult | null;
  if (!result) throw new Error(`knob_scope_rows(${noun}) returned nothing`);
  if (!result.ok) {
    throw new Error(result.detail ?? result.reason.replace(/_/g, " "));
  }
  return result.rows;
}
