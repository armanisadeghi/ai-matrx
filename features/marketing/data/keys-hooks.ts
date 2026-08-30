"use client";

/**
 * Client-side dual-mode resolvers for marketing URL keys.
 *
 * The `/marketing/[brandId]` tree's segments carry a slug OR a UUID
 * (lib/keys.ts). Server layouts resolve and canonicalize; these hooks are for
 * CLIENT surfaces that only have the raw segment (the shell sidebar, crumbs)
 * and need the row without waiting on a server pass. Same query shape as the
 * server resolvers in lib/keys-server.ts — keep the two in lockstep.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";
import {
  isPossibleMarketingKey,
  isUuid,
} from "@/features/marketing/lib/keys";

export interface BrandSegmentRow {
  id: string;
  slug: string | null;
  name: string;
  organization_id: string;
}

export interface SiteSegmentRow {
  id: string;
  slug: string | null;
  name: string | null;
  domain: string;
  brand_id: string | null;
}

async function fetchBrandBySegment(
  segment: string,
  signal?: AbortSignal,
): Promise<BrandSegmentRow | null> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const base = () =>
    db
      .from("brand")
      .select("id, slug, name, organization_id")
      .is("deleted_at", null);
  const isKey = !isUuid(segment) && isPossibleMarketingKey(segment);
  if (!isUuid(segment) && !isKey) return null;

  const response = await (isUuid(segment)
    ? base().eq("id", segment)
    : base().eq("slug", segment)
  )
    .abortSignal(abortSignal)
    .maybeSingle();
  if (response.error) throw response.error;
  if (response.data) return response.data;
  if (!isKey) return null;

  // ALIAS LANE — a renamed brand keeps its old keys (web.brand.previous_slugs),
  // so an old address still resolves to the row; canonicalizing layers replace
  // the URL with marketingSeg(row).
  const alias = await base()
    .contains("previous_slugs", [segment])
    .order("updated_at", { ascending: false })
    .limit(1)
    .abortSignal(abortSignal)
    .maybeSingle();
  if (alias.error) throw alias.error;
  return alias.data ?? null;
}

async function fetchSiteBySegment(
  brandId: string,
  segment: string,
  signal?: AbortSignal,
): Promise<SiteSegmentRow | null> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const base = () =>
    db
      .from("site")
      .select("id, slug, name, domain, brand_id")
      .eq("brand_id", brandId)
      .is("deleted_at", null);
  const isKey = !isUuid(segment) && isPossibleMarketingKey(segment);
  if (!isUuid(segment) && !isKey) return null;

  const response = await (isUuid(segment)
    ? base().eq("id", segment)
    : base().eq("slug", segment)
  )
    .abortSignal(abortSignal)
    .maybeSingle();
  if (response.error) throw response.error;
  if (response.data) return response.data;
  if (!isKey) return null;

  // ALIAS LANE — scoped to the brand; site keys are unique per brand.
  const alias = await base()
    .contains("previous_slugs", [segment])
    .order("updated_at", { ascending: false })
    .limit(1)
    .abortSignal(abortSignal)
    .maybeSingle();
  if (alias.error) throw alias.error;
  return alias.data ?? null;
}

/** Resolve a `/marketing/[brandId]` segment (slug or UUID) to the brand row. */
export function useBrandBySegment(segment: string | null) {
  return useQuery({
    queryKey: ["marketing", "brand-segment", segment] as const,
    queryFn: ({ signal }) => fetchBrandBySegment(segment as string, signal),
    enabled: Boolean(segment),
    staleTime: 60_000,
  });
}

/** Resolve a `[siteId]` segment within a brand (slug or UUID) to the site row. */
export function useSiteBySegment(
  brandId: string | null | undefined,
  segment: string | null,
) {
  return useQuery({
    queryKey: ["marketing", "site-segment", brandId, segment] as const,
    queryFn: ({ signal }) =>
      fetchSiteBySegment(brandId as string, segment as string, signal),
    enabled: Boolean(brandId && segment),
    staleTime: 60_000,
  });
}
