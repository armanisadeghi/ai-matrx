"use client";

/**
 * THE OFFERINGS A SITE PICKS FROM — its brand's offerings that this site has
 * selected (`web.site_offerings`), flattened parent → child so a person can SEE
 * that "Data Destruction Services" sits under "IT Asset Disposition (ITAD)".
 *
 * Nothing here is shared with another business: the list is the site's own
 * explicit selection (D2), and platform suggestions are asked for only inside
 * Add offering (see `OfferingPicker`). The site's organization rides along
 * because every offering write carries it explicitly.
 *
 * Plan of record: `docs/db_rebuild/proposals/brand-offerings-cutover.md`.
 */

import { useQuery } from "@tanstack/react-query";

import { getSite } from "@/features/marketing/data/service";
import {
  getOfferingStats,
  listSiteOfferings,
  type SiteOffering,
} from "@/features/marketing/seo/value-system/offerings/data";

export interface OfferingOption {
  offeringId: string;
  name: string;
  kind: string;
  depth: number;
  /** The root this offering hangs under (itself, when it IS a root). */
  rootId: string;
  rootName: string;
  /** Root › … › parent, for the type-ahead and the hint line. */
  lineage: string;
  /** Keywords placed on this offering or anything under it, in the window. */
  keywords: number;
  templateId: string | null;
}

export interface SiteOfferings {
  options: OfferingOption[];
  byId: Map<string, OfferingOption>;
  /** The offerings a new one can be filed under. */
  roots: OfferingOption[];
  /** The site's organization — every offering write carries it. */
  organizationId: string | null;
  loading: boolean;
  error: unknown;
}

/** Query-key roots every offering write invalidates. */
export const SITE_OFFERINGS_KEY = ["marketing", "offerings"] as const;

export const siteOrganizationKey = (siteId: string) =>
  ["marketing", "site", siteId, "organization"] as const;

/**
 * The organization a write must carry, or a sentence saying why it cannot be
 * made yet. Never a guess.
 */
export function requireOfferingOrganization(offerings: SiteOfferings): string {
  if (offerings.organizationId) return offerings.organizationId;
  throw new Error(
    offerings.error
      ? "This site could not be loaded, so nothing can be placed on its offerings yet."
      : "This site is still loading — try again in a moment.",
  );
}

function buildOptions(
  offerings: SiteOffering[],
  keywordsByOffering: Map<string, number>,
): OfferingOption[] {
  const byId = new Map(offerings.map((offering) => [offering.id, offering]));
  const children = new Map<string | null, SiteOffering[]>();
  for (const offering of offerings) {
    // A parent this site does not expose is not a place in THIS site's tree.
    const parent = offering.parentId && byId.has(offering.parentId) ? offering.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(offering);
    children.set(parent, list);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  }

  const subtreeKeywords = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    let total = keywordsByOffering.get(id) ?? 0;
    for (const child of children.get(id) ?? []) total += subtreeKeywords(child.id, seen);
    return total;
  };

  const options: OfferingOption[] = [];
  const visit = (offering: SiteOffering, depth: number, root: SiteOffering, trail: string[]) => {
    if (depth > 32) return;
    options.push({
      offeringId: offering.id,
      name: offering.name,
      kind: offering.kind,
      depth,
      rootId: root.id,
      rootName: root.name,
      lineage: trail.join(" › "),
      keywords: subtreeKeywords(offering.id),
      templateId: offering.templateId,
    });
    for (const child of children.get(offering.id) ?? []) {
      visit(child, depth + 1, root, [...trail, offering.name]);
    }
  };
  for (const root of children.get(null) ?? []) visit(root, 0, root, []);
  return options;
}

/**
 * The organization that owns a site — what every offering write must carry.
 * Read from the site row itself (`getSite`), never chosen or defaulted.
 */
export function useSiteOrganizationId(siteId: string, enabled = true) {
  return useQuery({
    queryKey: siteOrganizationKey(siteId),
    queryFn: async ({ signal }) => (await getSite(siteId, signal)).organization_id,
    enabled: enabled && Boolean(siteId),
    staleTime: 30 * 60_000,
  });
}

/**
 * `start`/`end` scope the keyword counts, so the picker's "312 kw" means the
 * same window as the table behind it.
 */
export function useSiteOfferings(
  siteId: string,
  start: string,
  end: string,
  /**
   * A surface that shows the Offering column on only one of its tabs turns the
   * reads off on the others. Hook order stays fixed; the reads simply do not run.
   */
  enabled = true,
): SiteOfferings {
  const organization = useSiteOrganizationId(siteId, enabled);
  const offerings = useQuery({
    queryKey: [...SITE_OFFERINGS_KEY, "site", siteId],
    queryFn: ({ signal }) => listSiteOfferings(siteId, signal),
    enabled: enabled && Boolean(siteId),
    staleTime: 5 * 60_000,
  });
  const stats = useQuery({
    queryKey: [...SITE_OFFERINGS_KEY, "stats", siteId, start, end],
    queryFn: ({ signal }) => getOfferingStats(siteId, start, end, signal),
    enabled: enabled && Boolean(siteId),
    staleTime: 5 * 60_000,
  });

  const keywordsByOffering = new Map<string, number>();
  for (const row of stats.data ?? []) {
    keywordsByOffering.set(row.offeringId, (keywordsByOffering.get(row.offeringId) ?? 0) + row.keywords);
  }
  // React Compiler is on — no manual memoization (CLAUDE.md core invariants).
  const options = buildOptions(offerings.data ?? [], keywordsByOffering);

  return {
    options,
    byId: new Map(options.map((option) => [option.offeringId, option])),
    roots: options.filter((option) => option.depth === 0),
    organizationId: organization.data ?? null,
    // A disabled query reports `isLoading` forever in react-query v5.
    loading: enabled && (organization.isLoading || offerings.isLoading || stats.isLoading),
    error: organization.error ?? offerings.error ?? stats.error,
  };
}
