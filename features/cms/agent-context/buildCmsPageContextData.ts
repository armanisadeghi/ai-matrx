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

import type { AgentWritePolicy } from "@/features/cms/types";
import { createCmsPageScope } from "@/features/surfaces/manifests/cms-page.manifest";
import { formatEditorSurroundContext } from "@/utils/format-editor-surround-context";
import type {
  ClientComponent,
  ClientPage,
  ClientPageSummary,
  ClientSite,
} from "../types";
import { clientPageUrl } from "../utils/pageUrls";
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
  /** Selection within whichever of html/css/js is the active tab's textarea. */
  selectionStart: number;
  selectionEnd: number;
}

function activeTabContent(
  activeTab: CmsPageEditorTab,
  html: string,
  css: string,
  js: string,
): string {
  if (activeTab === "html") return html;
  if (activeTab === "css") return css;
  if (activeTab === "js") return js;
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
    selectionStart,
    selectionEnd,
  } = args;

  const activeContent = activeTabContent(
    activeTab,
    htmlContent,
    cssContent,
    jsContent,
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
        category: page.category,
      })
    : undefined;
  const previewUrl = page
    ? clientPageUrl({
        siteSlug: site.slug,
        slug: page.slug,
        category: page.category,
        preview: true,
      })
    : undefined;

  const scope = createCmsPageScope({
    site_structure: siteStructure,
    site_id: site.id,
    site_slug: site.slug,
    agent_write_policy: policy,
    page_title: title,
    page_slug: slug,
    page_category: category || "general",
    page_type: pageType || "standard",
    active_tab: activeTab,
    html_content: htmlContent || undefined,
    css_content: cssContent || undefined,
    js_content: jsContent || undefined,

    live_url: liveUrl,
    preview_url: previewUrl,
    page_id: page?.id,
    is_home_page: page?.is_home_page,
    has_draft: page?.has_draft,
    is_published: page?.is_published,
    content: activeContent || undefined,
    meta_title: metaTitle || undefined,
    meta_description: metaDescription || undefined,
    selection: selectedText || undefined,
    text_before: textBefore || undefined,
    text_after: textAfter || undefined,
    context: surround,
  });

  return scope as Record<string, unknown>;
}
