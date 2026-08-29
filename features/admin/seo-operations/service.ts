/**
 * SEO Operations console — data access.
 *
 * Reads go DIRECT to Supabase under RLS (platform law). The site-evidence
 * picker reads the same agent.provision declaration the server consumes, so
 * the two surfaces cannot drift into competing value inventories.
 */
import { createClient } from "@/utils/supabase/client";
import { parseOfferedValues } from "@/features/agents/mandates/provision-shapes";
import {
  MANDATE_CONTRACT_COLUMNS,
  MANDATE_HOLDER_COLUMNS,
  contractOfMandate,
  holderOfMandate,
  mandateDefinitions,
  mandateProvisions,
  type HolderRef,
} from "@/lib/supabase/mandateStorage";
import type { Json } from "@/types/database.types";

export interface SeoMandateRow {
  id: string;
  mandate_key: string;
  label: string | null;
  description: string | null;
  provision_key: string | null;
  output_kind: string | null;
  /** The mandate's platform-default Holder, read through the storage router —
   * this console never names a schema's holder columns itself. */
  holder: HolderRef;
  contract: Json;
}

export interface SeoProvisionRow {
  key: string;
  label: string | null;
  description: string | null;
  values: Array<{
    name: string;
    kind: string;
    guaranteed?: boolean;
    lazy?: boolean;
    description?: string;
  }>;
  code_path: string | null;
}

export interface SeoTaskRow {
  id: string;
  title: string;
  kind: string;
  enabled: boolean;
  last_run_at: string | null;
  next_due_at: string | null;
}

export interface SeoSiteOption {
  id: string;
  domain: string;
}

export interface EvidenceValueSpec {
  name: string;
  kind: string;
  lazy: boolean;
  description: string;
}

export async function fetchSeoMandates(): Promise<SeoMandateRow[]> {
  const supabase = createClient();
  const { data, error } = await mandateDefinitions(supabase)
    .select(
      `id, mandate_key, label, description, provision_key, output_kind, ${MANDATE_HOLDER_COLUMNS}, ${MANDATE_CONTRACT_COLUMNS}` as const,
    )
    .is("deleted_at", null)
    .order("mandate_key");
  if (error) throw error;
  // Filter client-side — the proven MandatesConsole reads unfiltered and RLS
  // narrows; a PostgREST `like` pattern containing a dot returned zero rows
  // in production while the same rows load unfiltered (measured 2026-08-26).
  return (data ?? [])
    .filter((row) => row.mandate_key.startsWith("seo."))
    .map((row) => ({
      id: row.id,
      mandate_key: row.mandate_key,
      label: row.label,
      description: row.description,
      provision_key: row.provision_key,
      output_kind: row.output_kind,
      holder: holderOfMandate(row),
      contract: contractOfMandate(row),
    }));
}

export async function fetchSeoProvisions(): Promise<SeoProvisionRow[]> {
  const supabase = createClient();
  const { data, error } = await mandateProvisions(supabase)
    .select(
      "provision_key, label, description, offered_values, code_path",
    )
    .is("deleted_at", null)
    .order("provision_key");
  if (error) throw error;
  return (data ?? []).filter((row) => String(row.provision_key).startsWith("seo.")).map((row) => ({
    key: row.provision_key,
    label: row.label,
    description: row.description,
    values: parseOfferedValues(row.offered_values),
    code_path: row.code_path,
  }));
}

/** Every recurring task in the SEO/web family, enabled or not — the whole
 * point of the console is that Arman sees the OFF ones too. */
export async function fetchSeoTasks(): Promise<SeoTaskRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("scheduler")
    .from("sch_task")
    .select("id, title, kind, enabled, last_run_at, next_due_at")
    .is("deleted_at", null)
    .or(
      [
        "title.ilike.%seo%",
        "title.ilike.%crawl%",
        "title.ilike.%backlink%",
        "title.ilike.%visibility%",
        "title.ilike.%search console%",
        "title.ilike.%pagespeed%",
        "title.ilike.%rank%",
        "title.ilike.%keyword%",
      ].join(","),
    )
    .order("enabled", { ascending: false })
    .order("title");
  if (error) throw error;
  return (data ?? []) as SeoTaskRow[];
}

export async function fetchSeoSites(): Promise<SeoSiteOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("web")
    .from("site")
    .select("id, domain")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("domain");
  if (error) throw error;
  return (data ?? []) as SeoSiteOption[];
}

export async function fetchEvidenceValues(): Promise<EvidenceValueSpec[]> {
  const supabase = createClient();
  const { data, error } = await mandateProvisions(supabase)
    .select("offered_values")
    .eq("provision_key", "seo.site_evidence")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? parseOfferedValues(data.offered_values) : [];
}
