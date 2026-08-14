/**
 * Pure `contextData` builder for `matrx-user/cms-page`.
 *
 * Mirrors `features/notes/agent-context/buildNotesEditorContextData.ts`: one
 * function that turns live editor state (possibly-unsaved buffers, active
 * tab, selection) into the surface's `SurfaceScopePayload` via
 * `createCmsPageScope`. Shared by the menu's `getApplicationScope` and any
 * future non-menu consumer (e.g. a "…" bound-agent panel) so both read
 * identical values.
 */

import type { AgentWritePolicy, ClientEntityVersion } from "@/features/cms/types";
import {
  createCmsPageScope,
  type CmsPageVersionEntry,
} from "@/features/surfaces/manifests/cms-page.manifest";
import { formatEditorSurroundContext } from "@/utils/format-editor-surround-context";
import type {
  ClientComponent,
  ClientPage,
  ClientPageSummary,
  ClientSite,
} from "../types";
import { activeSiteDomain, clientPageRoute, clientPageUrl, sitePreviewToken } from "../utils/pageUrls";
import { buildSiteStructureXml } from "../utils/buildSiteStructureXml";

export type CmsPageEditorTab =
  "html" | "css" | "js" | "preview" | "seo" | "settings" | "versions";

const TEXT_NEIGHBOR_CHARS = 500;

export interface BuildCmsPageContextDataArgs {
  site: ClientSite;
  pages: readonly ClientPageSummary[];
  components: readonly ClientComponent[];
  /** null while creating a brand-new (unsaved) page — see `/pages/new`. */
  page: ClientPage | null;
  activeTab: CmsPageEditorTab;
  /** In-editor (possibly unsaved) buffers. */
  title: string;
  slug: string;
  category: string;
  pageType: string;
  htmlContent: string;
  cssContent: string;
  jsContent: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  ogImage: string;
  canonicalUrl: string;
  excerpt: string;
  showInNav: boolean;
  sortOrder: number;
  /** Comma-separated tags exactly as typed in the Settings tab. */
  tags: string;
  /** The save/load error currently shown in the editor, if any. */
  editorError?: string | null;
  /** Version history as loaded by the History tab — empty for a new page. */
  versions: readonly ClientEntityVersion[];
  /** Selection within whichever of html/css/js is the active tab's textarea. */
  selectionStart: number;
  selectionEnd: number;
}

function activeTabContent(
  activeTab: CmsPageEditorTab,
  html: string,
  css: string,
  js: string,
  metaDescription: string,
): string {
  if (activeTab === "html") return html;
  if (activeTab === "css") return css;
  if (activeTab === "js") return js;
  // On the SEO tab the bound editable buffer is the meta description (the one
  // Pro-wired, surface-scoped field) — mirrors html-page's `meta` tab gating.
  if (activeTab === "seo") return metaDescription;
  return "";
}

/** Canonical `contextData` for `matrx-user/cms-page`. */
export function buildCmsPageContextData(
  args: BuildCmsPageContextDataArgs,
): Record<string, unknown> {
  const {
    site,
    pages,
    components,
    page,
    activeTab,
    title,
    slug,
    category,
    pageType,
    htmlContent,
    cssContent,
    jsContent,
    metaTitle,
    metaDescription,
    metaKeywords,
    ogImage,
    canonicalUrl,
    excerpt,
    showInNav,
    sortOrder,
    tags,
    editorError,
    versions,
    selectionStart,
    selectionEnd,
  } = args;

  const activeContent = activeTabContent(
    activeTab,
    htmlContent,
    cssContent,
    jsContent,
    metaDescription,
  );
  const hasSelection = selectionEnd > selectionStart;
  const selectedText = hasSelection
    ? activeContent.slice(selectionStart, selectionEnd)
    : "";
  const textBefore = activeContent.slice(
    Math.max(0, selectionStart - TEXT_NEIGHBOR_CHARS),
    selectionStart,
  );
  const textAfter = activeContent.slice(
    selectionEnd,
    Math.min(activeContent.length, selectionEnd + TEXT_NEIGHBOR_CHARS),
  );
  const surround = formatEditorSurroundContext(activeContent, {
    selectionStart,
    selectionEnd,
  });

  const policy: AgentWritePolicy =
    site.settings?.agent_write_policy ?? "blocked";
  const siteStructure = buildSiteStructureXml({
    site,
    pages,
    components,
    current: page ? { kind: "page", id: page.id } : undefined,
  });

  const liveUrl = page?.is_published
    ? clientPageUrl({
        siteSlug: site.slug,
        slug: page.slug,
        route: page.route,
        category: page.category,
        domain: activeSiteDomain(site),
      })
    : undefined;
  const previewUrl = page
    ? clientPageUrl({
        siteSlug: site.slug,
        slug: page.slug,
        route: page.route,
        category: page.category,
        preview: true,
        previewToken: sitePreviewToken(site),
      })
    : undefined;

  // The page's real public path. Saved pages carry the trigger-computed
  // `route`; an unsaved buffer gets the same derivation the DB will apply.
  const pageRoute =
    page?.route ?? clientPageRoute({ slug, category: category || null });

  const tagList = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const versionEntries: CmsPageVersionEntry[] = versions.map((v) => ({
    version_number: v.version_number,
    operation: v.operation,
    occurred_at: v.occurred_at,
    is_current: v.is_current,
  }));
  const latestRestorable = versionEntries
    .filter((v) => !v.is_current)
    .reduce<number | undefined>(
      (max, v) =>
        max === undefined || v.version_number > max ? v.version_number : max,
      undefined,
    );

  const scope = createCmsPageScope({
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
    is_new_page: !page,
    page_title: title,
    page_slug: slug,
    page_category: category || "general",
    page_type: pageType || "standard",
    active_tab: activeTab,
    page_seo: {
      meta_title: metaTitle,
      meta_description: metaDescription,
      meta_keywords: metaKeywords,
      og_image: ogImage,
      canonical_url: canonicalUrl,
    },
    page_settings: {
      slug,
      route: pageRoute,
      category: category || "general",
      page_type: pageType || "standard",
      excerpt,
      tags: tagList,
      show_in_nav: showInNav,
      sort_order: sortOrder,
    },
    tags: tagList,
    show_in_nav: showInNav,
    sort_order: sortOrder,

    site_domain: site.domain ?? undefined,
    site_global_css: site.global_css ?? undefined,
    html_content: htmlContent || undefined,
    css_content: cssContent || undefined,
    js_content: jsContent || undefined,

    live_url: liveUrl,
    preview_url: previewUrl,
    page_id: page?.id,
    page_layout: page
      ? {
          route: page.route,
          layout_type: page.layout_type,
          use_client_header: page.use_client_header,
          use_client_footer: page.use_client_footer,
          parent_id: page.parent_id,
        }
      : undefined,
    is_home_page: page?.is_home_page,
    has_draft: page?.has_draft,
    is_published: page?.is_published,
    page_timestamps: page
      ? {
          created_at: page.created_at,
          updated_at: page.updated_at,
          publish_date: page.publish_date,
          published_date: page.published_date,
          last_published_at: page.last_published_at,
          author: page.author,
        }
      : undefined,
    page_provenance: page
      ? {
          source_html_page_id: page.source_html_page_id,
          source_artifact_id: page.source_artifact_id,
          source_message_id: page.source_message_id,
          source_conv_id: page.source_conv_id,
        }
      : undefined,
    content: activeContent || undefined,
    editor_error: editorError || undefined,
    meta_title: metaTitle || undefined,
    meta_description: metaDescription || undefined,
    meta_keywords: metaKeywords || undefined,
    og_image: ogImage || undefined,
    canonical_url: canonicalUrl || undefined,
    excerpt: excerpt || undefined,
    featured_image: page?.featured_image ?? undefined,
    version_history: versionEntries.length > 0 ? versionEntries : undefined,
    version_count: versionEntries.length > 0 ? versionEntries.length : undefined,
    latest_restorable_version: latestRestorable,
    selection: selectedText || undefined,
    text_before: textBefore || undefined,
    text_after: textAfter || undefined,
    context: surround,
  });

  return scope as Record<string, unknown>;
}
