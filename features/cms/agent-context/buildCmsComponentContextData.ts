/**
 * Pure `contextData` builder for `matrx-user/cms-component`.
 *
 * Mirrors `buildCmsPageContextData.ts`. The components page shows HTML and
 * CSS editors for the same component simultaneously (no tab switch), so
 * `content`/`selection`/`text_before`/`text_after` are left undefined here —
 * each field mounts its own menu instance with its own textarea ref, and
 * `buildApplicationScopeFromMenuContext` fills those baselines from whichever
 * field's DOM the menu actually opened on. `html_content`/`css_content`
 * always carry the full bodies regardless of which field is active.
 */

import type { AgentWritePolicy } from "@/features/cms/types";
import { createCmsComponentScope } from "@/features/surfaces/manifests/cms-component.manifest";
import type { ClientComponent, ClientPageSummary, ClientSite } from "../types";
import { buildSiteStructureXml } from "../utils/buildSiteStructureXml";

export interface BuildCmsComponentContextDataArgs {
  site: ClientSite;
  pages: readonly ClientPageSummary[];
  components: readonly ClientComponent[];
  /** null while the list is showing with nothing open for edit. */
  editingComponent: ClientComponent | null;
  /** In-editor (possibly unsaved) buffers — undefined when not editing. */
  htmlContent?: string;
  cssContent?: string;
}

/** Canonical `contextData` for `matrx-user/cms-component`. */
export function buildCmsComponentContextData(
  args: BuildCmsComponentContextDataArgs,
): Record<string, unknown> {
  const { site, pages, components, editingComponent, htmlContent, cssContent } =
    args;

  const policy: AgentWritePolicy =
    site.settings?.agent_write_policy ?? "blocked";
  const siteStructure = buildSiteStructureXml({
    site,
    pages,
    components,
    current: editingComponent
      ? { kind: "component", id: editingComponent.id }
      : undefined,
  });

  const scope = createCmsComponentScope({
    site_structure: siteStructure,
    site_id: site.id,
    site_slug: site.slug,
    agent_write_policy: policy,
    component_id: editingComponent?.id,
    component_type: editingComponent?.component_type,
    component_name: editingComponent?.name,
    has_draft: editingComponent?.has_draft,
    html_content: htmlContent,
    css_content: cssContent,
  });

  return scope as Record<string, unknown>;
}
