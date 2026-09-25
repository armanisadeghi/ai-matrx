// features/mandates/admin-list/rpc.ts
//
// The ONE call into `public.mnd_admin_list` (migrations/mnd_admin_list_server_read_2026_09_24.sql,
// extended by migrations/mnd_admin_list_sources_contract_page_rows_2026_09_25.sql).
// Platform admins only; RLS-respecting. Its four modes — page, counts, facets,
// agents — answer with JSON whose shapes are declared here.

import type { Database, Json } from "@/types/database.types";
import type {
  MandateBindingRow,
  MandateDefinitionRow,
} from "@/lib/supabase/mandateStorage";
import { supabase } from "@/utils/supabase/client";

export type MandateAdminListArgs =
  Database["public"]["Functions"]["mnd_admin_list"]["Args"];

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

export interface MandateAdminCountsAnswer {
  mine: number;
  orgs: number;
  system: number;
  orgs_narrow: { id: string; label: string; count: number }[];
}

export type MandateAdminFacetsAnswer = Record<string, { value: string; count: number }[]>;

export async function callMandateAdminList<T>(args: MandateAdminListArgs): Promise<T> {
  const { data, error } = await supabase.rpc("mnd_admin_list", args);
  if (error) {
    throw new Error(`Mandate list (${args.p_mode ?? "page"}): ${error.message}`);
  }
  return data as Json as unknown as T;
}
