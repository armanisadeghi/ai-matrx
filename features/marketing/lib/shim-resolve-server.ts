import "server-only";

import { cache } from "react";

import { isUuid, marketingSeg } from "@/features/marketing/lib/keys";
import { createClient } from "@/utils/supabase/server";

/**
 * Server resolution for the PRE-RESTRUCTURE marketing addresses.
 *
 * The old flat pillars and entity doors (`/marketing/capabilities?site=`,
 * `/marketing/content-plan/[siteId]`, `/marketing/changes/[changeId]`, …)
 * carry a site id and nothing else. The agency tree addresses every screen
 * brand-first, so each of those shims has to answer one question before it can
 * redirect: which brand owns this site, and what are the two canonical URL
 * segments?
 *
 * This is that ONE answer — never a per-shim lookup. Reads run under the
 * caller's JWT (RLS decides what exists), `cache()` dedupes within a request,
 * and slug segments are preferred so the shim lands on the canonical address
 * instead of a UUID one the layout would immediately rewrite.
 */

export interface LegacySiteAddress {
  /** Brand segment for `/marketing/<brandSeg>/…` — slug when the brand has one. */
  brandSeg: string;
  /** Site segment for `…/websites/<siteSeg>` or `…/seo/<siteSeg>`. */
  siteSeg: string;
}

/**
 * A legacy site id → the brand/site segments of its new home.
 *
 * Null when the id is malformed, the row is unreadable or deleted, or the site
 * has no brand — a brand-first URL cannot be built without a brand. Callers
 * decide what null means for them: the flat pillars land the visitor on the
 * client roster, the entity doors `notFound()`.
 */
export const resolveLegacySiteAddress = cache(
  async (siteId: string): Promise<LegacySiteAddress | null> => {
    if (!isUuid(siteId)) return null;
    const supabase = await createClient();
    const siteResponse = await supabase
      .schema("web")
      .from("site")
      .select("id, slug, brand_id")
      .eq("id", siteId)
      .is("deleted_at", null)
      .maybeSingle();
    if (siteResponse.error || !siteResponse.data?.brand_id) return null;
    const brandResponse = await supabase
      .schema("web")
      .from("brand")
      .select("id, slug")
      .eq("id", siteResponse.data.brand_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (brandResponse.error || !brandResponse.data) return null;
    return {
      brandSeg: marketingSeg(brandResponse.data),
      siteSeg: marketingSeg(siteResponse.data),
    };
  },
);
