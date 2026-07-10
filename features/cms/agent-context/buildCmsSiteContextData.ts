/**
 * Pure `contextData` builder for `matrx-user/cms-site`.
 *
 * List/workspace surface (page list, settings, components hub chrome) — no
 * editable content, so this only ever feeds a `NonEditableContextMenu`.
 * Emits the same `site_structure` framing XML as `cms-page`/`cms-component`
 * so an agent orients identically regardless of which of the three it's on.
 */

import type { AgentWritePolicy } from "@/features/cms/types";
import { createCmsSiteScope } from "@/features/surfaces/manifests/cms-site.manifest";
import type { ClientComponent, ClientPageSummary, ClientSite } from "../types";
import { buildSiteStructureXml } from "../utils/buildSiteStructureXml";
import { clientSiteRootUrl } from "../utils/pageUrls";

export interface BuildCmsSiteContextDataArgs {
  site: ClientSite;
  pages: readonly ClientPageSummary[];
  components: readonly ClientComponent[];
  /** Page row the user last hovered/right-clicked in the list, if any. */
  selectedPageId?: string;
}

/** Canonical `contextData` for `matrx-user/cms-site`. */
export function buildCmsSiteContextData(
  args: BuildCmsSiteContextDataArgs,
): Record<string, unknown> {
  const { site, pages, components, selectedPageId } = args;

  const policy: AgentWritePolicy =
    site.settings?.agent_write_policy ?? "blocked";
  const siteStructure = buildSiteStructureXml({
    site,
    pages,
    components,
    current: { kind: "site", id: site.id },
  });

  const scope = createCmsSiteScope({
    site_structure: siteStructure,
    site_id: site.id,
    site_slug: site.slug,
    site_name: site.name,
    agent_write_policy: policy,
    live_url: clientSiteRootUrl(site.slug),
    preview_url: clientSiteRootUrl(site.slug, true),
    pages_count: pages.length,
    selected_page_id: selectedPageId,
  });

  return scope as Record<string, unknown>;
}
