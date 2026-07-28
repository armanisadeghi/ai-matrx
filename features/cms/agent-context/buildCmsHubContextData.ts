/**
 * Pure `contextData` builder for `matrx-user/cms` (the hub).
 *
 * List/entry surface — no `site_structure` (per-site framing is owned by
 * `matrx-user/cms-site` and below). Just enough to let an agent find or
 * reference a site by name/slug before drilling in, or create a new one.
 */

import {
  createCmsHubScope,
  type CmsHubSiteSummaryEntry,
} from "@/features/surfaces/manifests/cms.manifest";
import type { ClientSiteSummary } from "../types";

/** Draft state of the Create New Site dialog, as typed so far. */
export interface CmsHubNewSiteDraft {
  name: string;
  slug: string;
  domain: string;
}

export interface BuildCmsHubContextDataArgs {
  sites: readonly ClientSiteSummary[];
  selectedSiteId?: string;
  /** In-progress Create New Site dialog values. */
  newSiteDraft?: CmsHubNewSiteDraft;
  /** Error message the hub is currently displaying, if any. */
  loadError?: string | null;
}

/**
 * Must emit EVERY field the manifest's `owned_sites_summary` description
 * promises (THE COMPLETENESS LAW — a UI cannot lie). `agent_write_policy` lives
 * in `settings`, not a column; the data key VALUE is never included, only
 * whether one has been minted.
 *
 * Exported because `matrx-user/cms-site` INHERITS this surface and must emit
 * byte-identical inventory rows.
 */
export function cmsSiteSummaryEntry(site: ClientSiteSummary): CmsHubSiteSummaryEntry {
  return {
    id: site.id,
    slug: site.slug,
    name: site.name,
    domain: site.domain,
    is_active: site.is_active,
    agent_write_policy: site.settings?.agent_write_policy ?? "blocked",
    has_data_api_key: site.has_data_api_key,
    created_at: site.created_at,
    updated_at: site.updated_at,
  };
}

/** Canonical `contextData` for `matrx-user/cms`. */
export function buildCmsHubContextData(
  args: BuildCmsHubContextDataArgs,
): Record<string, unknown> {
  const { sites, selectedSiteId, newSiteDraft, loadError } = args;

  const summary = sites.map(cmsSiteSummaryEntry);
  const draftIsEmpty =
    !newSiteDraft ||
    (!newSiteDraft.name && !newSiteDraft.slug && !newSiteDraft.domain);

  const scope = createCmsHubScope({
    owned_sites_count: summary.length,
    active_sites_count: summary.filter((s) => s.is_active).length,
    owned_sites_summary: summary,
    selected_site_id: selectedSiteId,
    // Composite convenience value the manifest declares — saves the agent an
    // index lookup into owned_sites_summary.
    selected_site: selectedSiteId
      ? summary.find((s) => s.id === selectedSiteId)
      : undefined,
    new_site_draft: draftIsEmpty ? undefined : { ...newSiteDraft },
    sites_load_error: loadError ?? undefined,
  });

  return scope as Record<string, unknown>;
}
