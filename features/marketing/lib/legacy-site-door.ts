import "server-only";

import { cache } from "react";

import { isUuid, marketingSeg } from "@/features/marketing/lib/keys";
import { createClient } from "@/utils/supabase/server";

/**
 * Resolve a bare `site_id` to the path segments of its client workspace.
 *
 * The flat `/marketing/sites/[siteId]/…` door exists because most rows in the
 * database know a site and nothing above it. The agency tree needs the brand
 * too, so the door resolves it server-side (browser → Supabase is the rule for
 * data the CLIENT renders; a redirect has nothing to render and must decide
 * before the response, which is exactly the `changes/[changeId]` pattern).
 *
 * Returns the KEY segments when the rows carry them, so the emitted address is
 * already canonical and the destination layout has nothing to replace.
 */
export interface LegacySiteDoor {
  brandSeg: string;
  siteSeg: string;
}

export const resolveLegacySiteDoor = cache(
  async (siteId: string): Promise<LegacySiteDoor | null> => {
    // The flat door was only ever built from `site.id` rows.
    if (!isUuid(siteId)) return null;
    const supabase = await createClient();
    const siteResponse = await supabase
      .schema("web")
      .from("site")
      .select("id, slug, brand_id")
      .eq("id", siteId)
      .is("deleted_at", null)
      .maybeSingle();
    if (siteResponse.error) throw siteResponse.error;
    const site = siteResponse.data;
    if (!site?.brand_id) return null;
    const brandResponse = await supabase
      .schema("web")
      .from("brand")
      .select("id, slug")
      .eq("id", site.brand_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (brandResponse.error) throw brandResponse.error;
    const brand = brandResponse.data;
    if (!brand) return null;
    return { brandSeg: marketingSeg(brand), siteSeg: marketingSeg(site) };
  },
);
