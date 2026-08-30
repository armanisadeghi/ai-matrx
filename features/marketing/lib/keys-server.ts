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

const BRAND_SEGMENT_COLUMNS = "id, slug, name, organization_id";
const SITE_SEGMENT_COLUMNS = "id, slug, name, domain, brand_id";

export const resolveBrandParam = cache(
  async (slugOrId: string): Promise<ResolvedBrand | null> => {
    const supabase = await createClient();
    const base = () =>
      supabase
        .schema("web")
        .from("brand")
        .select(BRAND_SEGMENT_COLUMNS)
        .is("deleted_at", null);
    const isKey = !isUuid(slugOrId) && isPossibleMarketingKey(slugOrId);
    if (!isUuid(slugOrId) && !isKey) return null;

    const { data, error } = await (isUuid(slugOrId)
      ? base().eq("id", slugOrId)
      : base().eq("slug", slugOrId)
    ).maybeSingle();
    if (error) {
      if (isPermissionDenied(error)) return null;
      throw error;
    }
    if (data) return data;
    if (!isKey) return null;

    // ALIAS LANE: a renamed brand keeps its old keys in `previous_slugs`, so a
    // bookmark to the old address still resolves. The caller canonicalizes
    // (requireBrandParam 308s to marketingSeg(row)), which is what turns the
    // alias hit into a forward to the current address.
    const alias = await base()
      .contains("previous_slugs", [slugOrId])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (alias.error) {
      if (isPermissionDenied(alias.error)) return null;
      throw alias.error;
    }
    return alias.data ?? null;
  },
);

export const resolveSiteParam = cache(
  async (brandId: string, slugOrId: string): Promise<ResolvedSite | null> => {
    const supabase = await createClient();
    const base = () =>
      supabase
        .schema("web")
        .from("site")
        .select(SITE_SEGMENT_COLUMNS)
        .eq("brand_id", brandId)
        .is("deleted_at", null);
    const isKey = !isUuid(slugOrId) && isPossibleMarketingKey(slugOrId);
    if (!isUuid(slugOrId) && !isKey) return null;

    const { data, error } = await (isUuid(slugOrId)
      ? base().eq("id", slugOrId)
      : base().eq("slug", slugOrId)
    ).maybeSingle();
    if (error) {
      if (isPermissionDenied(error)) return null;
      throw error;
    }
    if (data) return data;
    if (!isKey) return null;

    // ALIAS LANE — scoped to the brand, because site keys are unique per brand.
    const alias = await base()
      .contains("previous_slugs", [slugOrId])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (alias.error) {
      if (isPermissionDenied(alias.error)) return null;
      throw alias.error;
    }
    return alias.data ?? null;
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
