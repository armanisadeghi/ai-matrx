/**
 * Pure `contextData` builder for `matrx-user/cms-site`.
 *
 * Workspace surface covering `/cms/[siteId]` and all four of its tabs (Pages,
 * Components, Collections, Settings). `SiteLayoutClient` is the guarantee
 * boundary: it will not render children until the site row has loaded and it
 * caches the page + component lists, which is why every structural value here
 * is `alwaysAvailable`.
 *
 * Emits the same `site_structure` framing XML as `cms-page`/`cms-component`
 * so an agent orients identically regardless of which of the three it's on.
 *
 * TAB-SCOPED EXTRAS: `collections` and `settingsDraft` are loaded/held only by
 * their own tab, which re-emits the full scope through a nested
 * `<SurfaceRuntimeProvider>`. They are optional here for exactly that reason.
 *
 * INHERITANCE: this surface inherits `matrx-user/cms`, so it must also emit
 * the hub's always-available inventory values. The layout genuinely loads the
 * user's full site list for the switcher dropdown, so that promise is honest.
 */

import type { AgentWritePolicy } from "@/features/cms/types";
import {
  createCmsSiteScope,
  type CmsSiteCollectionEntry,
  type CmsSiteComponentEntry,
  type CmsSitePageEntry,
} from "@/features/surfaces/manifests/cms-site.manifest";
import type {
  ClientComponent,
  ClientPageSummary,
  ClientSite,
  SiteCollectionSummary,
} from "../types";
import { buildSiteStructureXml } from "../utils/buildSiteStructureXml";
import { clientSiteRootUrl } from "../utils/pageUrls";
import { cmsSiteSummaryEntry } from "./buildCmsHubContextData";

/** Which tab of the site workspace the user is on. */
export type CmsSiteMode =
  | "pages"
  | "components"
  | "collections"
  | "collection-items"
  | "settings"
  | "page-editor"
  | "new-page";

/** Unsaved edits held by the Settings tab form. */
export interface CmsSiteSettingsDraft {
  name: string;
  slug: string;
  domain: string;
  favicon: string;
  global_css: string;
  is_active: boolean;
}

export interface BuildCmsSiteContextDataArgs {
  site: ClientSite;
  pages: readonly ClientPageSummary[];
  components: readonly ClientComponent[];
  /** Every site the user owns — the layout's switcher list (inherited values). */
  allSites: readonly ClientSite[];
  /** Which tab the user is on; derived from the pathname by the layout. */
  currentMode: CmsSiteMode;
  /** Page row the user last hovered/right-clicked in the list, if any. */
  selectedPageId?: string;
  /** Collections tab only. */
  collections?: readonly SiteCollectionSummary[];
  /** Settings tab only. */
  settingsDraft?: CmsSiteSettingsDraft;
}

function toPageEntry(page: ClientPageSummary): CmsSitePageEntry {
  return {
    id: page.id,
    slug: page.slug,
    route: page.route,
    title: page.title,
    category: page.category,
    page_type: page.page_type,
    is_published: page.is_published,
    has_draft: page.has_draft,
    is_home_page: page.is_home_page,
    show_in_nav: page.show_in_nav,
    sort_order: page.sort_order,
    meta_title: page.meta_title,
    meta_description: page.meta_description,
    last_published_at: page.last_published_at,
    updated_at: page.updated_at,
  };
}

function toComponentEntry(comp: ClientComponent): CmsSiteComponentEntry {
  return {
    id: comp.id,
    component_type: comp.component_type,
    name: comp.name,
    is_active: comp.is_active,
    has_draft: comp.has_draft,
    last_published_at: comp.last_published_at,
    updated_at: comp.updated_at,
  };
}

/**
 * Field SCHEMAS are reduced to their key list — the full schema (types,
 * options, limits) belongs to the collection editor, not to every agent
 * launched from the tab.
 */
function toCollectionEntry(
  collection: SiteCollectionSummary,
): CmsSiteCollectionEntry {
  return {
    id: collection.id,
    slug: collection.slug,
    name: collection.name,
    description: collection.description,
    field_keys: collection.field_schema.map((f) => f.key),
    validation_mode: collection.validation_mode,
    public_read: collection.public_read,
    public_write: collection.public_write,
    searchable: collection.searchable,
    status: collection.status,
    item_count: collection.item_count,
    unread_count: collection.unread_count,
  };
}

/** Canonical `contextData` for `matrx-user/cms-site`. */
export function buildCmsSiteContextData(
  args: BuildCmsSiteContextDataArgs,
): Record<string, unknown> {
  const {
    site,
    pages,
    components,
    allSites,
    currentMode,
    selectedPageId,
    collections,
    settingsDraft,
  } = args;

  const policy: AgentWritePolicy =
    site.settings?.agent_write_policy ?? "blocked";
  const siteStructure = buildSiteStructureXml({
    site,
    pages,
    components,
    current: { kind: "site", id: site.id },
  });

  const inventory = allSites.map(cmsSiteSummaryEntry);
  const pageEntries = pages.map(toPageEntry);
  const componentEntries = components.map(toComponentEntry);
  const collectionEntries = collections?.map(toCollectionEntry);

  // Non-null jsonb defaults: the columns are declared non-null in
  // `features/cms/types.ts`, but a legacy row can still surface null over the
  // wire — coalescing here is what makes the `alwaysAvailable: true` promise
  // on the presentation values true rather than aspirational.
  const themeConfig = site.theme_config ?? {};
  const navigation = site.navigation ?? [];
  const footerConfig = site.footer_config ?? {};
  const metaDefaults = site.meta_defaults ?? {};
  const contactInfo = site.contact_info ?? {};
  const socialLinks = site.social_links ?? {};

  const scope = createCmsSiteScope({
    // ── inherited from matrx-user/cms ────────────────────────────────
    owned_sites_count: inventory.length,
    active_sites_count: inventory.filter((s) => s.is_active).length,
    owned_sites_summary: inventory,
    selected_site_id: site.id,
    selected_site: inventory.find((s) => s.id === site.id),

    // ── identity & URLs ──────────────────────────────────────────────
    site_id: site.id,
    site_slug: site.slug,
    site_name: site.name,
    site_domain: site.domain ?? undefined,
    site_is_active: site.is_active,
    live_url: clientSiteRootUrl(site.slug),
    preview_url: clientSiteRootUrl(site.slug, true),
    site_created_at: site.created_at,
    site_updated_at: site.updated_at,
    site_owner_user_id: site.owner_user_id ?? undefined,

    // ── content ──────────────────────────────────────────────────────
    site_structure: siteStructure,
    pages_summary: pageEntries,
    pages_count: pageEntries.length,
    published_pages_count: pageEntries.filter((p) => p.is_published).length,
    pages_with_draft_count: pageEntries.filter((p) => p.has_draft).length,
    home_page_id: pageEntries.find((p) => p.is_home_page)?.id,
    components_summary: componentEntries,
    components_count: componentEntries.length,

    // ── presentation & defaults ──────────────────────────────────────
    site_global_css: site.global_css ?? undefined,
    site_favicon: site.favicon ?? undefined,
    site_theme_config: themeConfig,
    site_navigation: navigation,
    site_footer_config: footerConfig,
    site_meta_defaults: metaDefaults,
    site_contact_info: contactInfo,
    site_social_links: socialLinks,
    site_profile: {
      theme_config: themeConfig,
      navigation,
      footer_config: footerConfig,
      meta_defaults: metaDefaults,
      contact_info: contactInfo,
      social_links: socialLinks,
      favicon: site.favicon,
    },

    // ── governance ───────────────────────────────────────────────────
    agent_write_policy: policy,
    policy_overrides: site.settings?.policy_overrides,
    has_data_api_key: Boolean(site.data_api_key),

    // ── collections (Collections tab only) ───────────────────────────
    collections_summary: collectionEntries,
    collections_count: collectionEntries?.length,
    collections_unread_count: collectionEntries?.reduce(
      (sum, c) => sum + c.unread_count,
      0,
    ),

    // ── workspace state ──────────────────────────────────────────────
    current_mode: currentMode,
    selected_page_id: selectedPageId,
    settings_draft: settingsDraft ? { ...settingsDraft } : undefined,
  });

  return scope as Record<string, unknown>;
}
