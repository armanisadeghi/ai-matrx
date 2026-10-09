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

/** One offering the site's BRAND owns, as the Offerings screen shows it. */
export interface CatalogOffering {
  id: string;
  parentId: string | null;
  name: string;
  kind: OfferingKind;
  description: string | null;
  sort: number;
  /** The platform suggestion it was copied from (D6), if any. */
  templateId: string | null;
  templateName: string | null;
  /** The brand edited its copy since adopting it. */
  changedFromTemplate: boolean;
  /** THIS site offers it (D2). */
  available: boolean;
  availabilityReason: string | null;
  otherSiteCount: number;
  /** This site's own worth ruling, in points (D9); null = no ruling here. */
  worthPoints: number | null;
  leadQuality: string | null;
  offeringMatch: string | null;
  worthNotes: string | null;
}

/** Every live offering the site's brand owns, with this site's availability and worth. */
export async function listBrandOfferingCatalog(
  siteId: string,
  signal?: AbortSignal,
): Promise<CatalogOffering[]> {
  const response = await (await webDb())
    .rpc("brand_offering_catalog", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(response.data, response.error, "read this brand's offerings");
  return (rows ?? []).map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    kind: row.kind === "product" ? "product" : "service",
    description: row.description,
    sort: row.sort,
    templateId: row.template_id,
    templateName: row.template_name,
    changedFromTemplate: row.changed_from_template === true,
    available: row.available === true,
    availabilityReason: row.availability_reason,
    otherSiteCount: Number(row.other_site_count ?? 0),
    worthPoints: row.worth_points === null ? null : Number(row.worth_points),
    leadQuality: row.lead_quality,
    offeringMatch: row.offering_match,
    worthNotes: row.worth_notes,
  }));
}

export interface AvailabilityImpact {
  offeringId: string;
  offeringName: string;
  available: boolean;
  placements: number;
  humanPlacements: number;
  hasWorth: boolean;
  keywordsInheritingWorth: number;
}

/** What stopping these offerings on this site would take with it — read before the click. */
export async function getAvailabilityImpact(
  siteId: string,
  offeringIds: string[],
  signal?: AbortSignal,
): Promise<AvailabilityImpact[]> {
  const response = await (await webDb())
    .rpc("site_offering_availability_impact", {
      p_site_id: siteId,
      p_offering_ids: offeringIds,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(response.data, response.error, "measure what that would change");
  return (rows ?? []).map((row) => ({
    offeringId: row.offering_id,
    offeringName: row.offering_name,
    available: row.available === true,
    placements: Number(row.placements ?? 0),
    humanPlacements: Number(row.human_placements ?? 0),
    hasWorth: row.has_worth === true,
    keywordsInheritingWorth: Number(row.keywords_inheriting_worth ?? 0),
  }));
}

export interface AvailabilityChange {
  offeringId: string;
  changed: boolean;
  placementsRemoved: number;
  placementsRestored: number;
  worthRemoved: number;
  worthRestored: number;
}

/**
 * THE availability writer (D2): offer, or stop offering, one or many brand
 * offerings on this site. Stopping removes this site's placements and worth on
 * them; offering again restores exactly those. The reason is kept (P24).
 */
export async function setSiteOfferingAvailability(input: {
  organizationId: string;
  siteId: string;
  offeringIds: string[];
  available: boolean;
  reason?: string | null;
}): Promise<AvailabilityChange[]> {
  const response = await (await webDb()).rpc("set_site_offering_availability", {
    p_organization_id: input.organizationId,
    p_site_id: input.siteId,
    p_offering_ids: input.offeringIds,
    p_available: input.available,
    ...(input.reason?.trim() ? { p_reason: input.reason.trim() } : {}),
  });
  const rows = assertGoverned(
    response.data,
    response.error,
    input.available ? "offer those on this site" : "stop offering those on this site",
  );
  return (rows ?? []).map((row) => ({
    offeringId: row.offering_id,
    changed: row.changed === true,
    placementsRemoved: Number(row.placements_removed ?? 0),
    placementsRestored: Number(row.placements_restored ?? 0),
    worthRemoved: Number(row.worth_removed ?? 0),
    worthRestored: Number(row.worth_restored ?? 0),
  }));
}

export interface OfferingRemovalImpact {
  offeringId: string;
  offeringName: string;
  childCount: number;
  keywordCount: number;
  valueCount: number;
  otherSiteCount: number;
}

/** What removing an offering from the brand takes with it, read before the click. */
export async function getOfferingRemovalImpact(
  siteId: string,
  offeringId: string,
  signal?: AbortSignal,
): Promise<OfferingRemovalImpact | null> {
  const response = await (await webDb())
    .rpc("site_offering_delete_impact", { p_site_id: siteId, p_offering_id: offeringId })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(response.data, response.error, "measure what removing it would change");
  const row = (rows ?? [])[0];
  if (!row) return null;
  return {
    offeringId: row.offering_id,
    offeringName: row.offering_name,
    childCount: Number(row.child_count ?? 0),
    keywordCount: Number(row.keyword_count ?? 0),
    valueCount: Number(row.value_count ?? 0),
    otherSiteCount: Number(row.other_site_count ?? 0),
  };
}

/**
 * Remove an offering from this site, and from the brand when no other site
 * offers it; its keywords move to `replacementOfferingId` or become unplaced.
 */
export async function removeSiteOffering(input: {
  organizationId: string;
  siteId: string;
  offeringId: string;
  replacementOfferingId: string | null;
}): Promise<{ keywordsReassigned: number; brandOfferingRetired: boolean }> {
  const response = await (await webDb()).rpc("remove_site_offering", {
    p_organization_id: input.organizationId,
    p_site_id: input.siteId,
    p_offering_id: input.offeringId,
    ...(input.replacementOfferingId
      ? { p_replacement_offering_id: input.replacementOfferingId }
      : {}),
  });
  const rows = assertGoverned(response.data, response.error, "remove that offering");
  const row = (rows ?? [])[0];
  return {
    keywordsReassigned: Number(row?.keywords_reassigned ?? 0),
    brandOfferingRetired: row?.brand_offering_retired === true,
  };
}

/** Reparent / reorder within the brand's catalog (D3). */
export async function moveBrandOffering(input: {
  organizationId: string;
  siteId: string;
  offeringId: string;
  parentId: string | null;
  siblingOrder: string[];
}): Promise<string> {
  const response = await (await webDb()).rpc("move_site_offering", {
    p_organization_id: input.organizationId,
    p_site_id: input.siteId,
    p_offering_id: input.offeringId,
    ...(input.parentId ? { p_parent_id: input.parentId } : {}),
    p_sibling_order: input.siblingOrder,
  });
  return assertGoverned(response.data, response.error, "move that offering");
}

/** This site's worth ruling on one offering, in points (D9); `clear` removes it. */
export async function setOfferingWorth(input: {
  organizationId: string;
  siteId: string;
  offeringId: string;
  worthPoints: number | null;
  leadQuality: string | null;
  offeringMatch: string | null;
  notes: string | null;
  clear?: boolean;
}): Promise<string | null> {
  const response = await (await seoDb()).rpc("set_site_offering_value", {
    p_organization_id: input.organizationId,
    p_site_id: input.siteId,
    p_brand_offering_id: input.offeringId,
    ...(input.worthPoints !== null ? { p_worth_points: input.worthPoints } : {}),
    ...(input.leadQuality ? { p_lead_quality: input.leadQuality } : {}),
    ...(input.offeringMatch ? { p_offering_match: input.offeringMatch } : {}),
    ...(input.notes?.trim() ? { p_notes: input.notes.trim() } : {}),
    ...(input.clear ? { p_clear: true } : {}),
  });
  if (response.error) {
    assertGoverned(null, response.error, "save that offering's worth");
  }
  return response.data ?? null;
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

/** The published price of one brand offering (all null = no published price). */
export interface OfferingPrice {
  amount: number | null;
  currency: string | null;
  unit: string | null;
  note: string | null;
}

export const NO_OFFERING_PRICE: OfferingPrice = { amount: null, currency: null, unit: null, note: null };

/** Published prices for a brand's live offerings, keyed by offering id. */
export async function listBrandOfferingPrices(
  brandId: string,
  signal?: AbortSignal,
): Promise<Record<string, OfferingPrice>> {
  const response = await (await webDb())
    .from("brand_offering")
    .select("id, price_amount, price_currency, price_unit, price_note")
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(response.data, response.error, "read this brand's offering prices");
  const out: Record<string, OfferingPrice> = {};
  for (const row of rows ?? []) {
    out[row.id] = {
      amount: row.price_amount === null ? null : Number(row.price_amount),
      currency: row.price_currency,
      unit: row.price_unit,
      note: row.price_note,
    };
  }
  return out;
}

/** Set (or clear, with all-null) the published price on one brand offering. Direct write, RLS-governed. */
export async function setBrandOfferingPrice(offeringId: string, price: OfferingPrice): Promise<void> {
  const response = await (await webDb())
    .from("brand_offering")
    .update({
      price_amount: price.amount,
      price_currency: price.amount === null ? null : (price.currency?.trim().toUpperCase() || "USD"),
      price_unit: price.unit?.trim() || null,
      price_note: price.note?.trim() || null,
    })
    .eq("id", offeringId)
    .select("id");
  assertGoverned(response.data, response.error, "save that offering's price");
}

// ── Brand-level catalog (no website required) ───────────────────────────────
// A brand offering belongs to its brand, so the catalog and its prices are
// readable and writable with no website at all. These go straight to
// `web.brand_offering` under RLS (brand editor) — the same door the price
// writer above already uses. Site availability, worth and keyword placement
// stay site-scoped and live in the site view.

function slugOf(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "offering";
}

/** Every live offering the brand owns, with no site-specific state. */
export async function listBrandCatalogForBrand(
  brandId: string,
  signal?: AbortSignal,
): Promise<CatalogOffering[]> {
  const response = await (await webDb())
    .from("brand_offering")
    .select("id, parent_id, name, kind, description, sort, template_id")
    .eq("brand_id", brandId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("sort")
    .order("name")
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(response.data, response.error, "read this brand's offerings");
  return (rows ?? []).map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    kind: row.kind === "product" ? "product" : "service",
    description: row.description,
    sort: row.sort,
    templateId: row.template_id,
    templateName: null,
    changedFromTemplate: false,
    available: false,
    availabilityReason: null,
    otherSiteCount: 0,
    worthPoints: null,
    leadQuality: null,
    offeringMatch: null,
    worthNotes: null,
  }));
}

/** Create or change a brand offering directly on the brand. Returns its id. */
export async function saveBrandOfferingForBrand(input: {
  organizationId: string;
  brandId: string;
  offeringId?: string | null;
  name: string;
  kind: OfferingKind;
  description?: string | null;
  parentId?: string | null;
}): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Give the offering a name.");
  const fields = {
    name,
    slug: slugOf(name),
    kind: input.kind,
    description: input.description?.trim() || null,
    parent_id: input.parentId ?? null,
  };
  const db = await webDb();
  if (input.offeringId) {
    const response = await db
      .from("brand_offering")
      .update(fields)
      .eq("id", input.offeringId)
      .eq("brand_id", input.brandId)
      .select("id");
    const rows = assertGoverned(response.data, response.error, "save that offering");
    if (!rows?.[0]) throw new Error("That offering is no longer in this brand.");
    return rows[0].id;
  }
  const response = await db
    .from("brand_offering")
    .insert({
      ...fields,
      organization_id: input.organizationId,
      brand_id: input.brandId,
      status: "active",
    })
    .select("id");
  const rows = assertGoverned(response.data, response.error, "add that offering");
  return rows[0].id;
}

/** Retire a brand offering (soft delete); its children move up to its parent. */
export async function retireBrandOfferingForBrand(input: {
  brandId: string;
  offeringId: string;
  parentId: string | null;
}): Promise<void> {
  const db = await webDb();
  const moved = await db
    .from("brand_offering")
    .update({ parent_id: input.parentId })
    .eq("brand_id", input.brandId)
    .eq("parent_id", input.offeringId)
    .select("id");
  assertGoverned(moved.data, moved.error, "keep its sub-offerings");
  const response = await db
    .from("brand_offering")
    .update({ deleted_at: new Date().toISOString(), status: "retired" })
    .eq("id", input.offeringId)
    .eq("brand_id", input.brandId)
    .select("id");
  assertGoverned(response.data, response.error, "remove that offering");
}
