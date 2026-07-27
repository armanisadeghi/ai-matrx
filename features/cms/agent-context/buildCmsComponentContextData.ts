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
import {
  createCmsComponentScope,
  type CmsComponentListEntry,
} from "@/features/surfaces/manifests/cms-component.manifest";
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
  /** Unsaved "New Component" dialog values — undefined when the dialog is closed. */
  pendingComponent?: { name: string; componentType: string };
}

/** Canonical `contextData` for `matrx-user/cms-component`. */
export function buildCmsComponentContextData(
  args: BuildCmsComponentContextDataArgs,
): Record<string, unknown> {
  const {
    site,
    pages,
    components,
    editingComponent,
    htmlContent,
    cssContent,
    pendingComponent,
  } = args;

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

  const componentsList: CmsComponentListEntry[] = components.map((c) => ({
    id: c.id,
    component_type: c.component_type,
    name: c.name,
    is_active: c.is_active,
    has_draft: c.has_draft,
  }));

  const scope = createCmsComponentScope({
    site_structure: siteStructure,
    site_id: site.id,
    site_slug: site.slug,
    site_name: site.name,
    agent_write_policy: policy,
    site_profile: {
      theme_config: site.theme_config,
      navigation: site.navigation,
      footer_config: site.footer_config,
      meta_defaults: site.meta_defaults,
      contact_info: site.contact_info,
      social_links: site.social_links,
      favicon: site.favicon,
      is_active: site.is_active,
    },
    components_list: componentsList,
    components_count: componentsList.length,
    is_editing: Boolean(editingComponent),

    site_domain: site.domain ?? undefined,
    site_global_css: site.global_css ?? undefined,
    component_id: editingComponent?.id,
    component_type: editingComponent?.component_type,
    component_name: editingComponent?.name,
    has_draft: editingComponent?.has_draft,
    is_active: editingComponent?.is_active,
    component_record: editingComponent
      ? {
          id: editingComponent.id,
          component_type: editingComponent.component_type,
          name: editingComponent.name,
          is_active: editingComponent.is_active,
          has_draft: editingComponent.has_draft,
          last_published_at: editingComponent.last_published_at,
          created_at: editingComponent.created_at,
          updated_at: editingComponent.updated_at,
        }
      : undefined,
    html_content: htmlContent,
    css_content: cssContent,
    pending_component: pendingComponent
      ? {
          name: pendingComponent.name,
          component_type: pendingComponent.componentType,
        }
      : undefined,
  });

  return scope as Record<string, unknown>;
}
