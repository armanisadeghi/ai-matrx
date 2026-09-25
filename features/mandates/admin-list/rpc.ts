// features/mandates/admin-list/rpc.ts
//
// The ONE call into `public.mnd_admin_list` (migrations/mnd_admin_list_server_read_2026_09_24.sql).
// Platform admins only; RLS-respecting. Its four modes — page, counts, facets,
// agents — answer with JSON whose shapes are declared here.

import type { Database, Json } from "@/types/database.types";
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
}

export interface MandateAdminPageAnswer {
  total: number;
  rows: MandateAdminPageRow[];
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
