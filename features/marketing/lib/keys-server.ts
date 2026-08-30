import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

import {
  isPossibleMarketingKey,
  isUuid,
  marketingSeg,
} from "@/features/marketing/lib/keys";

/**
 * An anonymous (or otherwise ungranted) session cannot SELECT web.brand /
 * web.site at all — PostgREST answers 42501 before RLS is even consulted.
 * That is "cannot resolve", not an exception: the caller decides between the
 * login redirect (the brand layout) and notFound (the require* helpers).
 */
function isPermissionDenied(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "42501"
  );
}

/**
 * Server-side dual-mode resolvers for the `/marketing/[brandId]` tree.
 *
 * Every dynamic marketing segment accepts a UUID or a key. Layouts call these
 * once per request (React `cache()` dedupes) and 308 a UUID address to the key
 * address so exactly one canonical URL exists per screen. Slug misses render
 * not-found without disclosing existence (RLS filters the read) — same
 * philosophy as the scope system's slug lane.
 */

export interface ResolvedBrand {
  id: string;
  slug: string | null;
  name: string;
  organization_id: string;
}

export interface ResolvedSite {
  id: string;
  slug: string | null;
  name: string | null;
  domain: string;
  brand_id: string | null;
}

export const resolveBrandParam = cache(
  async (slugOrId: string): Promise<ResolvedBrand | null> => {
    const supabase = await createClient();
    let query = supabase
      .schema("web")
      .from("brand")
      .select("id, slug, name, organization_id")
      .is("deleted_at", null);
    if (isUuid(slugOrId)) {
      query = query.eq("id", slugOrId);
    } else if (isPossibleMarketingKey(slugOrId)) {
      query = query.eq("slug", slugOrId);
    } else {
      return null;
    }
    const { data, error } = await query.maybeSingle();
    if (error) {
      if (isPermissionDenied(error)) return null;
      throw error;
    }
    return data ?? null;
  },
);

export const resolveSiteParam = cache(
  async (brandId: string, slugOrId: string): Promise<ResolvedSite | null> => {
    const supabase = await createClient();
    let query = supabase
      .schema("web")
      .from("site")
      .select("id, slug, name, domain, brand_id")
      .eq("brand_id", brandId)
      .is("deleted_at", null);
    if (isUuid(slugOrId)) {
      query = query.eq("id", slugOrId);
    } else if (isPossibleMarketingKey(slugOrId)) {
      query = query.eq("slug", slugOrId);
    } else {
      return null;
    }
    const { data, error } = await query.maybeSingle();
    if (error) {
      if (isPermissionDenied(error)) return null;
      throw error;
    }
    return data ?? null;
  },
);

/**
 * Resolve a brand param or refuse: null → notFound. When the param was a UUID
 * and the brand has a key, redirect to the canonical key address (path is the
 * full current pathname with the param swapped).
 */
export async function requireBrandParam(
  param: string,
  canonicalPath: (seg: string) => string,
): Promise<ResolvedBrand> {
  const brand = await resolveBrandParam(param);
  if (!brand) notFound();
  const seg = marketingSeg(brand);
  if (seg !== param) redirect(canonicalPath(seg));
  return brand;
}

export async function requireSiteParam(
  brand: ResolvedBrand,
  param: string,
  canonicalPath: (seg: string) => string,
): Promise<ResolvedSite> {
  const site = await resolveSiteParam(brand.id, param);
  if (!site) notFound();
  const seg = marketingSeg(site);
  if (seg !== param) redirect(canonicalPath(seg));
  return site;
}
