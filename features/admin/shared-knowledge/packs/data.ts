// features/admin/shared-knowledge/packs/data.ts
//
// Data layer for the Starter Packs tab of the Shared Knowledge console — the
// AUTHORING half of industry starter packs. READS reuse the pack feature's own
// module (`features/marketing/seo/value-system/data.ts`: catalog + detail);
// WRITES are the SECURITY DEFINER authoring family added 2026-08-22
// (`seo.starter_pack_save` / `_item_save` / `_item_delete` / `_rule_save` /
// `_rule_delete` / `_set_status` / `_new_version` / `_from_proposal`) — every
// one gated in the DB: platform admins, or industry curators while the pack is
// draft/proposed. Publishing is NOT here: it is the generic Library family
// (`useLibraryGrants` / `LibraryPublishPanel`). Subscribing is NOT here either:
// the user side calls `public.library_subscribe`.
// SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md § Starter packs.

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { makeAssertData } from "@/utils/errors";
import type { Json } from "@/types/database.types";
import {
  getStarterPackCatalog,
  getStarterPackDetail,
} from "@/features/marketing/seo/value-system/data";
import type {
  StarterPackDetail,
  StarterPackSummary,
} from "@/features/marketing/seo/value-system/types";

const assertData = makeAssertData("complete the starter-pack action");

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

// ── Query keys ───────────────────────────────────────────────────────────────
export const adminPacksQueryKey = ["admin", "starter-packs"] as const;
export const adminPackDetailQueryKey = (packId: string) =>
  ["admin", "starter-pack", packId] as const;

// ── Shapes ───────────────────────────────────────────────────────────────────
export type PackStatus = "draft" | "proposed" | "ratified" | "retired";

export interface PackStatusEvent {
  from: string | null;
  to: string;
  at: string;
  by: string | null;
  notes: string | null;
}

export interface PackOpenQuestion {
  question: string;
  why_it_matters: string;
  assumed_meanwhile: string;
}

/** The detail's pack record as the admin console reads it (superset of the summary). */
export interface AdminPackRecord extends StarterPackSummary {
  created_at: string;
  created_by: string | null;
  updated_by: string | null;
  proposed_by: string | null;
  ratified_by: string | null;
  proposed_industry: string | null;
  metadata: Record<string, unknown> | null;
  is_admin: boolean;
  status_history: PackStatusEvent[];
  open_questions: PackOpenQuestion[];
}

export interface AdminPackDetail extends Omit<StarterPackDetail, "pack"> {
  pack: AdminPackRecord;
}

// ── Reads ────────────────────────────────────────────────────────────────────
/** Every pack the caller may author or see (admins: all; curators: their industry's). */
export async function fetchAdminPackCatalog(signal?: AbortSignal): Promise<StarterPackSummary[]> {
  return getStarterPackCatalog(null, null, signal);
}

export async function fetchAdminPackDetail(packId: string, signal?: AbortSignal): Promise<AdminPackDetail> {
  const detail = await getStarterPackDetail(packId, signal);
  return detail as unknown as AdminPackDetail;
}

// ── Pack core ────────────────────────────────────────────────────────────────
export interface PackCorePatch {
  id?: string;
  name?: string;
  slug?: string;
  industry?: string;
  industry_id?: string | null;
  summary?: string | null;
  description?: string | null;
  geo_model?: string;
  guidelines?: string | null;
  source_notes?: string | null;
  proposed_industry?: string | null;
  metadata?: Record<string, Json>;
}

export async function savePack(patch: PackCorePatch): Promise<AdminPackRecord> {
  const response = await (await seoDb()).rpc("starter_pack_save", {
    p_pack: patch as unknown as Json,
  });
  return assertData(response.data, response.error, "save the pack") as unknown as AdminPackRecord;
}

export async function setPackStatus(
  packId: string,
  status: PackStatus,
  notes?: string | null,
): Promise<AdminPackRecord> {
  const response = await (await seoDb()).rpc("starter_pack_set_status", {
    p_pack_id: packId,
    p_status: status,
    ...(notes ? { p_notes: notes } : {}),
  });
  return assertData(response.data, response.error, "change the pack's status") as unknown as AdminPackRecord;
}

export async function newPackVersion(packId: string, slug?: string): Promise<AdminPackRecord> {
  const response = await (await seoDb()).rpc("starter_pack_new_version", {
    p_pack_id: packId,
    ...(slug ? { p_slug: slug } : {}),
  });
  return assertData(response.data, response.error, "clone the pack") as unknown as AdminPackRecord;
}

// ── Items (topic worth · value band · geo band · geo archetype) ──────────────
export type PackItemKind = "topic" | "value_band" | "geo_band" | "geo_area";

export interface PackItemPatch {
  id?: string;
  pack_id: string;
  item_kind: PackItemKind;
  topic_id?: string | null;
  weight?: number | null;
  lead_quality?: string | null;
  service_match?: string | null;
  value?: string | null;
  label?: string | null;
  description?: string | null;
  config?: Record<string, Json>;
  area_kind?: string | null;
  match_tokens?: string[];
  geo_band?: string | null;
  sort?: number;
  notes?: string | null;
}

export async function savePackItem(item: PackItemPatch): Promise<Record<string, unknown>> {
  const response = await (await seoDb()).rpc("starter_pack_item_save", {
    p_item: item as unknown as Json,
  });
  return assertData(response.data, response.error, "save the pack item") as Record<string, unknown>;
}

export async function deletePackItem(itemId: string): Promise<void> {
  const response = await (await seoDb()).rpc("starter_pack_item_delete", { p_item_id: itemId });
  if (response.error) assertData(null, response.error, "remove the pack item");
}

// ── Template rules (THE ONE rules engine, is_template + pack_id) ─────────────
export interface PackRulePatch {
  id?: string;
  pack_id: string;
  name?: string;
  description?: string | null;
  pattern?: string | null;
  match_kind?: string | null;
  match_facet?: string | null;
  match_facet_value?: string | null;
  target_class?: string | null;
  value_multiplier?: number | null;
  notes?: string | null;
}

export async function savePackRule(rule: PackRulePatch): Promise<Record<string, unknown>> {
  const response = await (await seoDb()).rpc("starter_pack_rule_save", {
    p_rule: rule as unknown as Json,
  });
  return assertData(response.data, response.error, "save the rule") as Record<string, unknown>;
}

export async function deletePackRule(ruleId: string): Promise<void> {
  const response = await (await seoDb()).rpc("starter_pack_rule_delete", { p_rule_id: ruleId });
  if (response.error) assertData(null, response.error, "remove the rule");
}

// ── Proposing from sample sites ──────────────────────────────────────────────
export interface AdminSiteOption {
  id: string;
  name: string | null;
  domain: string | null;
  organization_id: string;
}

/** Sites an admin may point the proposer at — searched, never a "complete" list. */
export async function searchAdminSites(query: string, limit = 25): Promise<AdminSiteOption[]> {
  await requireAuthenticatedSupabaseSession(supabase);
  let q = supabase
    .schema("web")
    .from("site")
    .select("id, name, domain, organization_id")
    .is("deleted_at", null)
    .order("domain", { ascending: true })
    .limit(limit);
  const needle = query.trim();
  if (needle) q = q.or(`domain.ilike.%${needle}%,name.ilike.%${needle}%`);
  const { data, error } = await q;
  if (error) assertData(null, error, "search sites");
  return (data ?? []) as AdminSiteOption[];
}

/** `seo.starter_pack_corpus` — real demand for the sample sites + the controlled vocabularies. */
export async function fetchPackCorpus(
  siteIds: string[],
  days = 365,
  topN = 120,
): Promise<Record<string, unknown>> {
  const response = await (await seoDb()).rpc("starter_pack_corpus", {
    p_site_ids: siteIds,
    p_days: days,
    p_top_n: topN,
  });
  return assertData(response.data, response.error, "read the sample sites' demand") as Record<string, unknown>;
}

export interface TopicOption {
  id: string;
  name: string;
  slug: string;
  node_type: string | null;
  parent_id: string | null;
  description: string | null;
}

/** The industry's topic tree slice the proposer reads — and the picker for the Topics section. */
export async function searchTopics(query: string, limit = 40): Promise<TopicOption[]> {
  await requireAuthenticatedSupabaseSession(supabase);
  let q = supabase
    .schema("seo")
    .from("topic")
    .select("id, name, slug, node_type, parent_id, description")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(limit);
  const needle = query.trim();
  if (needle) q = q.or(`name.ilike.%${needle}%,slug.ilike.%${needle}%`);
  const { data, error } = await q;
  if (error) assertData(null, error, "search topics");
  return (data ?? []) as TopicOption[];
}

/** Land a proposer-agent output (`seo_starter_pack_proposal_v1`) as a DRAFT pack. */
export async function packFromProposal(input: {
  proposal: Record<string, unknown>;
  industryId: string | null;
  sourceCorpus?: Record<string, unknown> | null;
  sourceSiteIds?: string[];
}): Promise<AdminPackRecord> {
  const response = await (await seoDb()).rpc("starter_pack_from_proposal", {
    p_proposal: input.proposal as unknown as Json,
    ...(input.industryId ? { p_industry_id: input.industryId } : {}),
    ...(input.sourceCorpus ? { p_source_corpus: input.sourceCorpus as unknown as Json } : {}),
    ...(input.sourceSiteIds?.length ? { p_source_site_ids: input.sourceSiteIds } : {}),
  });
  return assertData(response.data, response.error, "land the proposal as a draft pack") as unknown as AdminPackRecord;
}

// ── Labels shared by the sections ────────────────────────────────────────────
export const PACK_STATUS_META: Record<
  PackStatus,
  { label: string; hint: string; tone: string }
> = {
  draft: {
    label: "Draft",
    hint: "Being assembled. Visible to admins and this industry's curators only.",
    tone: "border-border bg-muted text-muted-foreground",
  },
  proposed: {
    label: "Proposed",
    hint: "Submitted for ratification. Can be piloted with one organization; not yet publishable to an industry.",
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  ratified: {
    label: "Ratified",
    hint: "Signed off by a domain expert — publishable to an industry or everyone.",
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  retired: {
    label: "Retired",
    hint: "Superseded. Industry/global audiences were withdrawn; adopted sites keep their rows.",
    tone: "border-border bg-muted text-muted-foreground",
  },
};

export const GEO_MODELS: Array<{ value: string; label: string }> = [
  { value: "local_radius", label: "Serves a driving radius" },
  { value: "metro", label: "Serves one metro" },
  { value: "regional", label: "Serves a region" },
  { value: "national", label: "Serves the whole country" },
  { value: "global", label: "Serves anywhere" },
];

export const MATCH_KINDS = ["contains", "word", "exact", "starts_with", "ends_with"] as const;
export const TARGET_CLASSES = ["money", "educational", "brand", "mismatch"] as const;
// Values are the site tables' CHECK vocabularies (seo.site_topic_value / site_geo_area) —
// a pack item must be copyable onto a site without translation.
export const LEAD_QUALITIES = ["high_value", "medium_value", "low_value", "negative_value"] as const;
export const SERVICE_MATCHES = ["core_service", "adjacent_service", "not_offered", "actively_avoided"] as const;
export const AREA_KINDS = ["city", "county", "region", "state", "country", "radius", "other"] as const;
