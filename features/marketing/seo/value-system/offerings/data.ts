/**
 * BRAND OFFERINGS — data layer.
 *
 * A company offering belongs to its brand (`web.brand_offering`); a website
 * exposes only the offerings selected for it (`web.site_offering`); platform
 * suggestions (`web.offering_template`) are reachable only inside Add offering
 * and are copied into the brand on adoption. Every read here is scoped to one
 * site, and every write carries that site's organization explicitly — the
 * database refuses a write whose organization does not own the site, and a
 * placement or worth on an offering the site has not selected.
 *
 * THE CONTRACT (the one list of offering reads and writes, client and service
 * lanes): `features/marketing/FEATURE.md` § Canonical offering writers.
 * Plan of record: `docs/db_rebuild/proposals/brand-offerings-cutover.md`.
 *
 * Keyword PLACEMENT reads and writes live beside the other keyword writes in
 * `features/marketing/seo/keyword-workbench/data.ts`.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { extractErrorMessage, makeAssertData } from "@/utils/errors";

async function webDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("web");
}

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("reach this site's offerings");

/**
 * The offering writers refuse in sentences written for the person reading
 * them ("select the offering for this site first"). Strip the machine code,
 * keep the sentence.
 */
const GOVERNED =
  /^(offering_[a-z_]+|site_offering_[a-z_]+|keyword_offering_[a-z_]+|brand_offering_[a-z_]+|gsc_[a-z_]+|seo_[a-z_]+):\s*/;

function assertGoverned<T>(data: T | null, error: unknown, action: string): T {
  if (error) {
    const message = extractErrorMessage(error).split(" · ")[0];
    const governed = message.match(GOVERNED);
    if (governed) {
      throw new Error(message.slice(governed[0].length), { cause: error });
    }
  }
  return assertData(data, error, action) as T;
}

export type OfferingKind = "product" | "service";

/** One brand offering this site exposes. */
export interface SiteOffering {
  id: string;
  brandId: string;
  templateId: string | null;
  name: string;
  slug: string;
  kind: string;
  parentId: string | null;
  description: string | null;
  sort: number;
}

/** Every offering THIS site exposes (D2 — absence means the site does not offer it). */
export async function listSiteOfferings(
  siteId: string,
  signal?: AbortSignal,
): Promise<SiteOffering[]> {
  const response = await (await webDb())
    .rpc("site_offerings", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(response.data, response.error, "read this site's offerings");
  return (rows ?? []).map((row) => ({
    id: row.id,
    brandId: row.brand_id,
    templateId: row.template_id,
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    parentId: row.parent_id,
    description: row.description,
    sort: row.sort,
  }));
}

export interface OfferingStatRow {
  offeringId: string;
  valueBand: string;
  keywords: number;
  clicks: number;
  impressions: number;
}

/** Keywords, clicks and impressions per offering and value band, for one window. */
export async function getOfferingStats(
  siteId: string,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<OfferingStatRow[]> {
  const response = await (await seoDb())
    .rpc("gsc_offering_stats", { p_site_id: siteId, p_start: start, p_end: end })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(response.data, response.error, "count this site's offering traffic");
  return (rows ?? []).map((row) => ({
    offeringId: row.offering_id,
    valueBand: row.value_band,
    keywords: Number(row.keywords ?? 0),
    clicks: Number(row.clicks ?? 0),
    impressions: Number(row.impressions ?? 0),
  }));
}

export interface OfferingTemplate {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  /** True when this brand already adopted it. */
  adopted: boolean;
}

/** Platform suggestions — asked for ONLY while a person is adding an offering (D6). */
export async function searchOfferingTemplates(
  siteId: string,
  search: string,
  signal?: AbortSignal,
): Promise<OfferingTemplate[]> {
  const response = await (await webDb())
    .rpc("offering_templates_for_site", { p_site_id: siteId, p_search: search })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(response.data, response.error, "look up offering suggestions");
  return (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    description: row.description,
    adopted: row.adopted === true,
  }));
}

/**
 * Adopt a suggestion: copies it (and the offering ancestors it needs) into the
 * brand and makes it available on this site. Returns the brand offering id.
 */
export async function adoptOfferingTemplate(input: {
  organizationId: string;
  siteId: string;
  templateId: string;
}): Promise<string> {
  const response = await (await webDb()).rpc("adopt_offering_template", {
    p_organization_id: input.organizationId,
    p_site_id: input.siteId,
    p_template_id: input.templateId,
  });
  return assertGoverned(response.data, response.error, "add that offering");
}

/**
 * Create a brand offering (it becomes available on this site in the same write)
 * or rename / retype / reparent one the brand owns. Returns its id.
 */
export async function saveSiteOffering(input: {
  organizationId: string;
  siteId: string;
  offeringId?: string | null;
  name: string;
  kind: OfferingKind;
  description?: string | null;
  parentId?: string | null;
}): Promise<string> {
  const response = await (await webDb()).rpc("save_site_offering", {
    p_organization_id: input.organizationId,
    p_site_id: input.siteId,
    p_name: input.name,
    p_kind: input.kind,
    ...(input.offeringId ? { p_offering_id: input.offeringId } : {}),
    ...(input.description ? { p_description: input.description } : {}),
    ...(input.parentId ? { p_parent_id: input.parentId } : {}),
  });
  return assertGoverned(response.data, response.error, "save that offering");
}
