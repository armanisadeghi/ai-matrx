/**
 * Keyword DIMENSIONS — data layer for the dimension manager.
 *
 * WHY THIS FILE EXISTS. Until 2026-08-21 the keyword vocabulary was 13 hard
 * TEXT columns on seo.keyword, each fenced by a CHECK array. A business could
 * not add the one dimension its own economics depend on without an engineer
 * and a migration, and an agent that invented `certificate_seeking` in its head
 * on Tuesday used a different set on Wednesday — nondeterministic by
 * construction, and the user got no say. `migrations/seo_keyword_facet_dimensions.sql`
 * moved the vocabulary into platform.categories and gave sites the right to
 * author their own. This module is the client half of that contract.
 *
 * THE CONTRACT (all SECURITY DEFINER, all governance enforced in the DB):
 *  - seo.facet_dimension_catalog(p_site_id)  — every dimension this site sees.
 *  - seo.facet_dimension_upsert(...)         — p_site_id NULL = platform
 *                                              (super-admin); set = the site's own.
 *  - seo.facet_value_upsert(...)             — add / edit a value.
 *  - seo.facet_registry_usage()              — keywords carrying each value.
 *
 * NEVER re-implement a governance check here. The DB raises `seo_registry_*:`
 * with a sentence written for the reader; `assertGoverned` strips the code and
 * surfaces that sentence verbatim. A UI-only check is not a rule.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { extractErrorMessage, makeAssertData } from "@/utils/errors";
import type { Json } from "@/types/database.types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("reach your keyword dimensions");

/**
 * Governance codes the dimension contract raises. Every one of these carries a
 * sentence AFTER the colon that was written for a non-technical reader — it is
 * shown as-is, never replaced with "something went wrong".
 */
const GOVERNANCE_CODE =
  /^(seo_registry_[a-z_]+|seo_rule_[a-z_]+|gsc_no_keywords|gsc_site_[a-z_]+):\s*/;

function assertGoverned<T>(data: T | null, error: unknown, action: string): T {
  if (error) {
    const message = extractErrorMessage(error).split(" · ")[0];
    const governed = message.match(GOVERNANCE_CODE);
    if (governed) {
      throw new Error(message.slice(governed[0].length), { cause: error });
    }
  }
  return assertData(data, error, action) as T;
}

export type DimensionScope = "platform" | "site";
export type DimensionCardinality = "single" | "multi";

/** One choice inside a dimension — `equipment_class` → `crt`. */
export interface FacetValue {
  value_id: string;
  /** Full identity, `dimension:value`. Never editable — data points at it. */
  slug: string;
  /** The value half of the identity, e.g. `crt`. */
  key: string;
  label: string;
  description: string | null;
  keyword_count: number;
}

export interface FacetDimension {
  dimension_id: string;
  slug: string;
  label: string;
  description: string | null;
  scope: DimensionScope;
  cardinality: DimensionCardinality;
  site_id: string | null;
  is_system: boolean;
  value_count: number;
  keyword_count: number;
  rule_count: number;
  values: FacetValue[];
}

interface CatalogRow {
  dimension_id: string;
  slug: string;
  label: string;
  description: string | null;
  scope: string;
  cardinality: string;
  site_id: string | null;
  is_system: boolean;
  value_count: number;
  keyword_count: number;
  rule_count: number;
  facet_values: Json;
}

function toFacetValues(raw: Json): FacetValue[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, Json>;
    const valueId = typeof row.value_id === "string" ? row.value_id : null;
    if (!valueId) return [];
    return [
      {
        value_id: valueId,
        slug: typeof row.slug === "string" ? row.slug : "",
        key: typeof row.key === "string" ? row.key : "",
        label: typeof row.label === "string" ? row.label : "",
        description:
          typeof row.description === "string" ? row.description : null,
        keyword_count:
          typeof row.keyword_count === "number" ? row.keyword_count : 0,
      },
    ];
  });
}

/**
 * Every dimension that applies to this site: the platform ones every tenant
 * shares, PLUS the ones this site authored. ONE call powers the whole screen.
 */
export async function getFacetDimensionCatalog(
  siteId: string,
  signal?: AbortSignal,
): Promise<FacetDimension[]> {
  const response = await (await seoDb())
    .rpc("facet_dimension_catalog", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(
    response.data,
    response.error,
    "load your keyword dimensions",
  ) as CatalogRow[];
  return rows.map((row) => ({
    dimension_id: row.dimension_id,
    slug: row.slug,
    label: row.label,
    description: row.description,
    scope: row.scope === "site" ? "site" : "platform",
    cardinality: row.cardinality === "multi" ? "multi" : "single",
    site_id: row.site_id,
    is_system: row.is_system,
    value_count: Number(row.value_count ?? 0),
    keyword_count: Number(row.keyword_count ?? 0),
    rule_count: Number(row.rule_count ?? 0),
    values: toFacetValues(row.facet_values),
  }));
}

export interface DimensionDraft {
  slug: string;
  label: string;
  description: string | null;
  cardinality: DimensionCardinality;
  /** The site that owns it. NULL is a PLATFORM dimension — super admins only. */
  siteId: string | null;
}

/**
 * Create or rename a dimension. The DB decides who may: a site dimension is
 * anyone with access to that site; a platform dimension is a fact every tenant
 * shares, so only a super admin may mint one.
 */
export async function upsertFacetDimension(
  draft: DimensionDraft,
): Promise<string> {
  const response = await (await seoDb()).rpc("facet_dimension_upsert", {
    p_slug: draft.slug,
    p_label: draft.label,
    p_description: draft.description ?? undefined,
    p_site_id: draft.siteId ?? undefined,
    p_cardinality: draft.cardinality,
  });
  return assertGoverned(
    response.data,
    response.error,
    "save this dimension",
  ) as string;
}

export interface FacetValueDraft {
  dimension: string;
  value: string;
  label: string;
  description: string | null;
  siteId: string | null;
  position?: number | null;
}

/** Create or re-label a value on a dimension. */
export async function upsertFacetValue(
  draft: FacetValueDraft,
): Promise<string> {
  const response = await (await seoDb()).rpc("facet_value_upsert", {
    p_dimension: draft.dimension,
    p_value: draft.value,
    p_label: draft.label,
    p_description: draft.description ?? undefined,
    p_site_id: draft.siteId ?? undefined,
    p_position: draft.position ?? undefined,
  });
  return assertGoverned(
    response.data,
    response.error,
    "save this value",
  ) as string;
}

/**
 * Turn what a human typed into the machine identity the fact store FKs into.
 * Shown to the user before they commit — the identity is permanent, so it is
 * never a hidden derivation.
 */
export function toIdentitySlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/g, "")
    .slice(0, 60);
}

/** The DB's rule, mirrored ONLY to disable a button before a doomed round-trip. */
export const IDENTITY_PATTERN = /^[a-z][a-z0-9_]*$/;
