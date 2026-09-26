// features/unified-data/cutover/dataTablesSwitched.ts — WHERE /data's TABLES WENT (lane SWITCH-AFTERMATH).
//
// When an owner presses Data tables → new system (FLIP-SEAMS' switch on the organization settings
// page), every older table of that organization is archived and its same-id copy in the record store
// becomes the table. /data's home read ONLY the older store (`get_user_tables`), so after the press it
// listed nothing for that organization — "blanks everywhere" (Arman, 2026-09-26, on his own org).
//
// Two reads, both the store's own doors:
//   · `platform.data_tables_switched_for_me()` — my organizations whose switch is on, when and by whom;
//   · `custom.table_list_everywhere(org)` — that organization's tables where they now live, with the
//     same row shape `get_user_tables` gives (name, description, row_count, field_count, user_id …).
// Nothing is decided here that the store does not say.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SwitchedOrganization {
  organizationId: string;
  organizationName: string;
  switchedAt: string;
  switchedBy: string | null;
}

/** A table as /data's home draws it: the older list's row shape, plus where it lives. */
export interface HomeTable {
  id: string;
  table_name: string;
  description: string;
  row_count: number;
  field_count: number;
  updated_at: string;
  last_activity_at?: string;
  is_public: boolean;
  visibility?: string | null;
  organization_id?: string | null;
  user_id: string;
  /** "records" = the table lives in the new system (its organization switched). Absent = older. */
  store?: "records";
}

export type Answer<T> = { ok: true; data: T } | { ok: false; why: string };

/** My organizations whose Data tables switch is on the new system. */
export async function switchedOrganizations(client: SupabaseClient): Promise<Answer<SwitchedOrganization[]>> {
  const { data, error } = await client
    .schema("platform" as never)
    .rpc("data_tables_switched_for_me" as never);
  if (error) return { ok: false, why: error.message };
  const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
  return {
    ok: true,
    data: rows
      .filter((r) => typeof r.organization_id === "string")
      .map((r) => ({
        organizationId: r.organization_id as string,
        organizationName: typeof r.organization_name === "string" ? r.organization_name : "This organization",
        switchedAt: typeof r.switched_at === "string" ? r.switched_at : "",
        switchedBy: typeof r.switched_by === "string" ? r.switched_by : null,
      })),
  };
}

/** One switched organization's tables in the new system, in the older list's shape. */
export async function tablesWhereTheyLive(client: SupabaseClient, organizationId: string): Promise<Answer<HomeTable[]>> {
  const { data, error } = await client
    .schema("custom" as never)
    .rpc("table_list_everywhere" as never, { p_organization_id: organizationId } as never);
  if (error) return { ok: false, why: error.message };
  const envelope = (data ?? {}) as { success?: unknown; tables?: unknown };
  if (envelope.success !== true || !Array.isArray(envelope.tables)) {
    return { ok: false, why: "the record store did not list this organization's tables" };
  }
  return {
    ok: true,
    data: (envelope.tables as Array<Record<string, unknown>>)
      .filter((t) => t.store === "records" && t.kept_by_the_app !== true && typeof t.id === "string")
      .map((t) => ({
        id: t.id as string,
        table_name: typeof t.table_name === "string" ? t.table_name : "Untitled table",
        description: typeof t.description === "string" ? t.description : "",
        row_count: Number(t.row_count ?? 0),
        field_count: Number(t.field_count ?? 0),
        updated_at: typeof t.updated_at === "string" ? t.updated_at : "",
        last_activity_at: typeof t.last_activity_at === "string" ? t.last_activity_at : undefined,
        is_public: false,
        visibility: typeof t.visibility === "string" ? t.visibility : null,
        organization_id: organizationId,
        user_id: typeof t.user_id === "string" ? t.user_id : "",
        store: "records" as const,
      })),
  };
}

/** The settings card where the switch (and Switch back) lives. */
export function switchBackHref(organizationId: string): string {
  return `/organizations/${organizationId}/settings#data`;
}

/** "Data tables moved to the new system on Sep 26, 2026 by admin@admin.com." */
export function movedSentence(org: SwitchedOrganization): string {
  const when = org.switchedAt
    ? new Date(org.switchedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
  return `Data tables moved to the new system${when ? ` on ${when}` : ""}${org.switchedBy ? ` by ${org.switchedBy}` : ""}.`;
}
