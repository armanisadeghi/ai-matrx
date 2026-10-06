// features/marketing/seo/site-context/service.ts — the reads and writes behind a
// site's context page (`…/seo/[site]/context`, OpenSEO Wave 3 item 5).
//
// Every fact is read DIRECT from Supabase from the one place it is stored —
// the same stores `seo_site` action `context` (aidream
// `services/seo/site_context.py`) reads for an agent:
//   goals        marketing.initiative, the brand's ACTIVE ones;
//   page roles   web.page desired_values.keyword_plan.page_role;
//   competitors  seo.competitor, current rows (archived left out), ignored counted;
//   voice        web.voice_fingerprint, brand scope (confirmed first, else newest);
//   expertise    knob expertise.seo, the person's level;
//   vocabulary   knobs seo.site.page_roles + seo.site.page_role_aliases.
// Row security decides what comes back; the active organization is never a
// filter. Writes: a page role through the page plan's one read-merge-write
// (`updatePageDesiredValues`), expertise through the knob's declared door at
// the `user` rung.

import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";
import {
  fetchKnobIndex,
  fetchKnobWriteDoor,
  writeKnobOverrideThroughDoor,
} from "@/lib/scoped-config/service";
import type { KnobOverrideSetResult, ScopedKnob } from "@/lib/scoped-config/types";
import { listFingerprints, type FingerprintRow } from "@/features/marketing/voice/service";
import { keywordPlanOf, vocabularyFromKnobs, type PageRoleVocabulary } from "./page-roles";

/** A screenful per list; each list says how many exist when there are more. */
export const CONTEXT_LIST_CAP = 100;

export const PAGE_ROLES_KNOB = { feature: "seo", key: "site.page_roles" } as const;
export const PAGE_ROLE_ALIASES_KNOB = { feature: "seo", key: "site.page_role_aliases" } as const;
export const CONTEXT_MAX_BYTES_KNOB = { feature: "seo", key: "site.context_max_bytes" } as const;
export const EXPERTISE_KNOB = { feature: "expertise", key: "seo" } as const;
export const EXPERTISE_LEVELS = ["beginner", "practitioner", "expert"] as const;
export type ExpertiseLevel = (typeof EXPERTISE_LEVELS)[number];

/** Current competitor rows — `archived` is how a row is retired. */
export const CURRENT_TRACKING = ["candidate", "tracked", "ignored"] as const;

export interface ListPage<T> {
  rows: T[];
  total: number;
}

export interface GoalRow {
  id: string;
  name: string | null;
  objective: string | null;
  goal: unknown;
  starts_on: string | null;
  ends_on: string | null;
}

export async function fetchSiteGoals(brandId: string): Promise<ListPage<GoalRow>> {
  const { data, error, count } = await supabase
    .schema("marketing")
    .from("initiative")
    .select("id,name,objective,goal,starts_on,ends_on", { count: "exact" })
    .eq("brand_id", brandId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("starts_on", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true })
    .limit(CONTEXT_LIST_CAP);
  if (error) throw new Error(`Reading goals failed: ${error.message}`);
  const rows = (data ?? []) as GoalRow[];
  return { rows, total: count ?? rows.length };
}

export interface RolePageRow {
  id: string;
  url: string;
  version: number;
  desired_values: unknown;
}

const ROLE_PATH = "desired_values->keyword_plan->>page_role";

/** Pages with a recorded role, by URL. The role test is in the query. */
export async function fetchRolePages(siteId: string): Promise<ListPage<RolePageRow>> {
  const db = await authenticatedWebDb(supabase);
  const { data, error, count } = await db
    .from("page")
    .select("id,url,version,desired_values", { count: "exact" })
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .not(ROLE_PATH, "is", null)
    .neq(ROLE_PATH, "")
    .order("url", { ascending: true })
    .limit(CONTEXT_LIST_CAP);
  if (error) throw new Error(`Reading page roles failed: ${error.message}`);
  const rows = (data ?? []) as unknown as RolePageRow[];
  return { rows, total: count ?? rows.length };
}

/** Up to 10 of this site's pages whose URL contains `term`, to give one a role. */
export async function searchSitePages(siteId: string, term: string): Promise<RolePageRow[]> {
  const clean = term.trim().replace(/[%_,()]/g, "");
  if (!clean) return [];
  const db = await authenticatedWebDb(supabase);
  const { data, error } = await db
    .from("page")
    .select("id,url,version,desired_values")
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .ilike("url", `%${clean}%`)
    .order("url", { ascending: true })
    .limit(10);
  if (error) throw new Error(`Searching pages failed: ${error.message}`);
  return (data ?? []) as unknown as RolePageRow[];
}

/** The page's keyword_plan as stored right now (the role write keeps every other key). */
export async function fetchKeywordPlan(siteId: string, pageId: string): Promise<Record<string, unknown>> {
  const db = await authenticatedWebDb(supabase);
  const { data, error } = await db
    .from("page")
    .select("desired_values")
    .eq("site_id", siteId)
    .eq("id", pageId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Reading the page plan failed: ${error.message}`);
  return keywordPlanOf(data?.desired_values);
}

export interface CompetitorFactRow {
  id: string;
  display_domain: string | null;
  normalized_domain: string;
  display_name: string | null;
  tracking_status: string;
  classification_status: string | null;
  posture: string | null;
}

export interface SiteCompetitors {
  kept: CompetitorFactRow[];
  /** Current rows the person ruled out (`ignored` / posture `ignore`); agents never see them. */
  ignored: number;
  total: number;
}

export function isIgnoredCompetitor(row: Pick<CompetitorFactRow, "tracking_status" | "posture">): boolean {
  return row.tracking_status === "ignored" || row.posture === "ignore";
}

export async function fetchSiteCompetitors(siteId: string): Promise<SiteCompetitors> {
  const { data, error, count } = await supabase
    .schema("seo")
    .from("competitor")
    .select(
      "id,display_domain,normalized_domain,display_name,tracking_status,classification_status,posture",
      { count: "exact" },
    )
    .eq("site_id", siteId)
    .in("tracking_status", [...CURRENT_TRACKING])
    .order("display_domain", { ascending: true })
    .limit(500);
  if (error) throw new Error(`Reading competitors failed: ${error.message}`);
  const rows = (data ?? []) as CompetitorFactRow[];
  const kept = rows.filter((r) => !isIgnoredCompetitor(r));
  const order: Record<string, number> = { confirmed: 0, proposed: 1 };
  kept.sort(
    (a, b) =>
      (order[a.classification_status ?? ""] ?? 2) - (order[b.classification_status ?? ""] ?? 2) ||
      (a.display_domain ?? "").localeCompare(b.display_domain ?? ""),
  );
  return { kept, ignored: rows.length - kept.length, total: count ?? rows.length };
}

/** The brand voice an agent is given: confirmed first, else the newest draft. */
export function pickBrandVoice(rows: FingerprintRow[]): FingerprintRow | null {
  if (!rows.length) return null;
  return rows.find((r) => r.status === "confirmed") ?? rows[0];
}

export async function fetchBrandVoice(brandId: string): Promise<FingerprintRow | null> {
  return pickBrandVoice(await listFingerprints("brand", brandId));
}

export interface SiteContextSettings {
  vocabulary: PageRoleVocabulary;
  /** Which rung set the allowed list (organization or platform default). */
  origin: string | null;
  /** The size an agent's context read is fitted to (bytes), or null if unregistered. */
  maxBytes: number | null;
}

/** Page-role vocabulary and context budget as the SITE's organization resolves them (as the server does). */
export async function fetchSiteContextSettings(organizationId: string): Promise<SiteContextSettings> {
  const keys = await fetchKnobIndex({ organizationId, featurePrefix: PAGE_ROLES_KNOB.feature });
  const find = (k: { feature: string; key: string }) =>
    keys.find((knob) => knob.full_key === `${k.feature}.${k.key}`) ?? null;
  const roles = find(PAGE_ROLES_KNOB);
  const aliases = find(PAGE_ROLE_ALIASES_KNOB);
  const budget = find(CONTEXT_MAX_BYTES_KNOB)?.effective_value;
  if (!roles) throw new Error("The page-role list setting is not registered.");
  return {
    vocabulary: vocabularyFromKnobs(roles.effective_value, aliases?.effective_value),
    origin: roles.origin ?? null,
    maxBytes: typeof budget === "number" ? budget : null,
  };
}

/** The person's own SEO expertise knob in the organization they work in. */
export async function fetchExpertise(options: {
  organizationId: string;
  userId: string;
}): Promise<ScopedKnob | null> {
  const keys = await fetchKnobIndex({
    organizationId: options.organizationId,
    featurePrefix: EXPERTISE_KNOB.feature,
    // The user rung is its own parameter; knob_index refuses it in p_scopes.
    userId: options.userId,
  });
  return keys.find((k) => k.full_key === `${EXPERTISE_KNOB.feature}.${EXPERTISE_KNOB.key}`) ?? null;
}

/**
 * Set (or with `null`, clear) the person's own level, at the `user` rung,
 * through the door the key declares. The door's `mayWrite` speaks for the
 * organization rung only; the user rung's own rule (yourself, a member) is
 * decided by the door itself and comes back as a refusal envelope.
 */
export async function setOwnExpertise(options: {
  organizationId: string;
  userId: string;
  level: ExpertiseLevel | null;
}): Promise<KnobOverrideSetResult> {
  const door = await fetchKnobWriteDoor({
    fullKey: `${EXPERTISE_KNOB.feature}.${EXPERTISE_KNOB.key}`,
    organizationId: options.organizationId,
  });
  return writeKnobOverrideThroughDoor({
    door,
    feature: EXPERTISE_KNOB.feature,
    key: EXPERTISE_KNOB.key,
    scopeKind: "user",
    scopeId: options.userId,
    organizationId: options.organizationId,
    value: options.level,
  });
}
