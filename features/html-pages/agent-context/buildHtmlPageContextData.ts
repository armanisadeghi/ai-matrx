/**
 * Pure `contextData` builder for `matrx-user/html-page`.
 *
 * Mirrors `features/cms/agent-context/buildCmsPageContextData.ts` but for the
 * OTHER content system — standalone `html_pages` rows. No draft/publish
 * twins, no site tree, no `agent_write_policy`. Framing value is the flat
 * `html_pages_structure` sibling list, never `site_structure`.
 */

import { createHtmlPageScope } from "@/features/surfaces/manifests/html-page.manifest";
import type { HtmlPageRecord, HtmlPageSummary } from "../types";
import { buildHtmlPagesStructureXml } from "../utils/buildHtmlPagesStructureXml";

const TEXT_NEIGHBOR_CHARS = 500;

/** Which editable region `selection`/`content` should be read from. */
export type HtmlPageEditorTab = "meta" | "html" | "preview";

export interface BuildHtmlPageContextDataArgs {
  page: HtmlPageRecord;
  /** Sibling pages for the framing XML — includes `page` itself. */
  siblingPages: readonly HtmlPageSummary[];
  /** Which tab is mounted — gates which buffer `content`/`selection` read from. */
  activeTab: HtmlPageEditorTab;
  /** In-editor (possibly unsaved) buffers. */
  htmlContent: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  ogImage: string;
  canonicalUrl: string;
  isIndexable: boolean;
  /** True when the editor holds unsaved changes. */
  isDirty: boolean;
  /** Adjacent page ids the editor's prev/next controls move to. */
  prevPageId?: string | null;
  nextPageId?: string | null;
  /** Selection within the active tab's textarea, when known. */
  selectionStart?: number;
  selectionEnd?: number;
}

/** The active tab's own buffer — mirrors `activeTabContent` in `buildCmsPageContextData.ts`. */
function activeTabContent(
  activeTab: HtmlPageEditorTab,
  htmlContent: string,
  metaDescription: string,
): string {
  if (activeTab === "html") return htmlContent;
  if (activeTab === "meta") return metaDescription;
  return "";
}

/** Canonical `contextData` for `matrx-user/html-page`. */
export function buildHtmlPageContextData(
  args: BuildHtmlPageContextDataArgs,
): Record<string, unknown> {
  const {
    page,
    siblingPages,
    activeTab,
    htmlContent,
    metaTitle,
    metaDescription,
    metaKeywords,
    ogImage,
    canonicalUrl,
    isIndexable,
    isDirty,
    prevPageId,
    nextPageId,
    selectionStart = 0,
    selectionEnd = 0,
  } = args;

  const activeContent = activeTabContent(
    activeTab,
    htmlContent,
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

  const structure = buildHtmlPagesStructureXml({
    pages: siblingPages,
    currentId: page.id,
  });

  const scope = createHtmlPageScope({
    html_pages_structure: structure,
    page_id: page.id,
    live_url: page.url,
    meta_title: metaTitle,
    is_indexable: isIndexable,
    sibling_page_count: siblingPages.length,
    meta_description: metaDescription || undefined,
    meta_keywords: metaKeywords || undefined,
    og_image: ogImage || undefined,
    canonical_url: canonicalUrl || undefined,
    page_seo: {
      meta_title: metaTitle,
      meta_description: metaDescription,
      meta_keywords: metaKeywords,
      og_image: ogImage,
      canonical_url: canonicalUrl,
      is_indexable: isIndexable,
    },
    page_timestamps: {
      created_at: page.created_at,
      updated_at: page.updated_at,
    },
    page_provenance: {
      artifact_id: page.artifact_id,
      source_message_id: page.source_message_id,
      source_conv_id: page.source_conv_id,
    },
    page_context_metadata: page.context_metadata ?? undefined,
    html_content: htmlContent || undefined,
    active_tab: activeTab,
    is_dirty: isDirty,
    prev_page_id: prevPageId ?? undefined,
    next_page_id: nextPageId ?? undefined,
    content: activeContent || undefined,
    selection: selectedText || undefined,
    text_before: textBefore || undefined,
    text_after: textAfter || undefined,
  });

  return scope as Record<string, unknown>;
}
