// features/mandates/admin-list/rpc.ts
//
// The ONE call into the admin mandate read (migrations/mnd_admin_list_server_read_2026_09_24.sql,
// extended by migrations/mnd_admin_list_sources_contract_page_rows_2026_09_25.sql and
// split into two doors by migrations/mnd_admin_list_system_only_support_lookup_2026_09_26.sql).
// Platform admins only; RLS-respecting. Its four modes — page, counts, facets,
// agents — answer with JSON whose shapes are declared here.
//
// TWO LANES, TWO DOORS (Arman, 2026-09-26):
//   system   public.mnd_admin_list          the management page — SYSTEM mandates only
//   support  public.mnd_admin_support_list  the support lookup — organizations' and people's

import type { Database, Json } from "@/types/database.types";
import type {
  MandateBindingRow,
  MandateDefinitionRow,
} from "@/lib/supabase/mandateStorage";
import { supabase } from "@/utils/supabase/client";

export type MandateAdminListArgs =
  Database["public"]["Functions"]["mnd_admin_list"]["Args"];

/** Which admin page is asking: the management list or the support lookup. */
export type MandateAdminLane = "system" | "support";

/** One row of a `page` answer: the ids plus the facts only the database knows. */
export interface MandateAdminPageRow {
  id: string;
  mandate_key: string;
  customized_by: string[];
  serves: string[];
  serves_detail: string[];
  backs_count: number;
  home_label: string;
  feature_label: string;
  /** The record's OWNER LEVEL — never the viewer (the admin seat, 2026-09-26). */
  owner_level: "system" | "org" | "user";
  /** "System", the organization's name, or the person who owns it. */
  owner_label: string;
  /** "Mismatch" | "Matches" | "Not checked" — the persisted contract verdicts. */
  contract_check: MandateContractState;
}

export type MandateContractState = "Mismatch" | "Matches" | "Not checked";

/**
 * THE PAGE'S OWN ROWS, in the same call (header item 3 of the 2026-09-25
 * migration): the definition rows, their live bindings, and every holder they
 * name — exactly the columns `fetchMandateConsoleData` used to read in two
 * sequential follow-up requests.
 */
export interface MandateAdminPageConsole {
  mandates: MandateDefinitionRow[];
  bindings: MandateBindingRow[];
  agents: {
    id: string;
    name: string | null;
    version: number | null;
    is_archived: boolean | null;
    agent_type: string | null;
    auto_context_disabled: boolean | null;
    variable_definitions: unknown;
    context_policies: unknown;
    output_schema: unknown;
  }[];
  versions: {
    id: string;
    agent_id: string | null;
    version_number: number;
    name: string | null;
    /** Carried since migrations/mnd_admin_list_pinned_version_declarations_2026_09_25.sql. */
    variable_definitions?: unknown;
    context_policies?: unknown;
  }[];
  workflows: { id: string; name: string; is_archived: boolean | null }[];
  workflow_versions: { id: string; definition_id: string; version_number: number }[];
}

export interface MandateAdminPageAnswer {
  total: number;
  rows: MandateAdminPageRow[];
  /** Absent only from a database older than the 2026-09-25 migration. */
  console?: MandateAdminPageConsole;
}

/**
 * The counts answer. The management lane answers `system` alone (it has one
 * corpus and no tabs); the support lane answers its three views and their
 * narrows. There is never a "mine" (Arman, 2026-09-26).
 */
export interface MandateAdminCountsAnswer {
  system?: number;
  orgs?: number;
  users?: number;
  all?: number;
  orgs_narrow?: { id: string; label: string; count: number }[];
  /** One option per person; `id` is that person's personal organization. */
  users_narrow?: { id: string; label: string; count: number }[];
}

export type MandateAdminFacetsAnswer = Record<string, { value: string; count: number }[]>;

export async function callMandateAdminList<T>(
  args: MandateAdminListArgs,
  lane: MandateAdminLane = "system",
): Promise<T> {
  const { data, error } =
    lane === "support"
      ? await supabase.rpc("mnd_admin_support_list", args)
      : await supabase.rpc("mnd_admin_list", args);
  if (error) {
    // A door's refusal is a sentence written for a person and is carried
    // intact; a statement timeout is not, so it gets plain words. `code` rides
    // along so the list shell can tell a refusal (no Retry) from a breakage.
    const message =
      error.code === "57014"
        ? "The mandate list took too long to answer. Try again in a moment."
        : `${lane === "support" ? "Mandate support lookup" : "Mandate list"} (${args.p_mode ?? "page"}): ${error.message}`;
    throw Object.assign(new Error(message), {
      code: error.code,
      details: error.details,
      hint: error.hint,
      refused: error.code === "42501",
    });
  }
  return data as Json as unknown as T;
}
