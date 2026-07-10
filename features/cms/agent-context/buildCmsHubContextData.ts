/**
 * Pure `contextData` builder for `matrx-user/cms` (the hub).
 *
 * List/entry surface — no `site_structure` (per-site framing is owned by
 * `matrx-user/cms-site` and below). Just enough to let an agent find or
 * reference a site by name/slug before drilling in, or create a new one.
 */

import { createCmsHubScope } from "@/features/surfaces/manifests/cms.manifest";
import type { ClientSite } from "../types";

export interface BuildCmsHubContextDataArgs {
  sites: readonly ClientSite[];
  selectedSiteId?: string;
}

/** Canonical `contextData` for `matrx-user/cms`. */
export function buildCmsHubContextData(
  args: BuildCmsHubContextDataArgs,
): Record<string, unknown> {
  const { sites, selectedSiteId } = args;

  const scope = createCmsHubScope({
    owned_sites_count: sites.length,
    owned_sites_summary: sites.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      is_active: s.is_active,
    })),
    selected_site_id: selectedSiteId,
  });

  return scope as Record<string, unknown>;
}
