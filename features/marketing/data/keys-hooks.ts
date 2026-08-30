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
  let query = (await authenticatedWebDb(supabase))
    .from("brand")
    .select("id, slug, name, organization_id")
    .is("deleted_at", null);
  if (isUuid(segment)) query = query.eq("id", segment);
  else if (isPossibleMarketingKey(segment)) query = query.eq("slug", segment);
  else return null;
  const response = await query
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (response.error) throw response.error;
  return response.data ?? null;
}

async function fetchSiteBySegment(
  brandId: string,
  segment: string,
  signal?: AbortSignal,
): Promise<SiteSegmentRow | null> {
  let query = (await authenticatedWebDb(supabase))
    .from("site")
    .select("id, slug, name, domain, brand_id")
    .eq("brand_id", brandId)
    .is("deleted_at", null);
  if (isUuid(segment)) query = query.eq("id", segment);
  else if (isPossibleMarketingKey(segment)) query = query.eq("slug", segment);
  else return null;
  const response = await query
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (response.error) throw response.error;
  return response.data ?? null;
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
