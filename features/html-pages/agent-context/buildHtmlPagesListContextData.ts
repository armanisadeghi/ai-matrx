/**
 * Pure `contextData` builder for the `matrx-user/html-page` surface as mounted
 * on the LIST route (`/cms/html-pages`), not the editor.
 *
 * The editor builder (`buildHtmlPageContextData.ts`) needs a fully-loaded
 * `HtmlPageRecord` (html body, tab, selection). The list only holds
 * `HtmlPageSummary` rows and has no live editor buffer, so this builder emits
 * the same `html_pages_structure` framing value plus read-only page identity:
 *
 *   - list-level (outer menu, no row targeted) → no `current`, empty identity.
 *   - per-row (right-click a card/row) → that page marked `current="true"`,
 *     its `page_id` / `live_url` / `meta_*` filled from the summary.
 *
 * `content` / `selection` stay empty — the list is not an editable buffer.
 */

import { createHtmlPageScope } from "@/features/surfaces/manifests/html-page.manifest";
import type { HtmlPageSummary } from "../types";
import { buildHtmlPagesStructureXml } from "../utils/buildHtmlPagesStructureXml";

export interface BuildHtmlPagesListContextDataArgs {
  /** Every standalone page the user has published — the framing list. */
  pages: readonly HtmlPageSummary[];
  /** The row/card the menu was opened on, if any. */
  selectedPageId?: string;
}

/** Canonical list-route `contextData` for `matrx-user/html-page`. */
export function buildHtmlPagesListContextData(
  args: BuildHtmlPagesListContextDataArgs,
): Record<string, unknown> {
  const { pages, selectedPageId } = args;

  const structure = buildHtmlPagesStructureXml({
    pages,
    currentId: selectedPageId,
  });
  const selected = selectedPageId
    ? pages.find((p) => p.id === selectedPageId)
    : undefined;

  const scope = createHtmlPageScope({
    html_pages_structure: structure,
    page_id: selected?.id ?? "",
    live_url: selected?.url ?? "",
    meta_title: selected?.meta_title ?? "",
    is_indexable: selected?.is_indexable ?? false,
    sibling_page_count: pages.length,
    meta_description: selected?.meta_description || undefined,
    meta_keywords: selected?.meta_keywords || undefined,
    og_image: selected?.og_image || undefined,
    canonical_url: selected?.canonical_url || undefined,
    page_seo: selected
      ? {
          meta_title: selected.meta_title,
          meta_description: selected.meta_description,
          meta_keywords: selected.meta_keywords,
          og_image: selected.og_image,
          canonical_url: selected.canonical_url,
          is_indexable: selected.is_indexable,
        }
      : undefined,
    page_timestamps: selected
      ? { created_at: selected.created_at, updated_at: selected.updated_at }
      : undefined,
    page_provenance: selected
      ? {
          artifact_id: selected.artifact_id,
          source_message_id: selected.source_message_id,
          source_conv_id: selected.source_conv_id,
        }
      : undefined,
  });

  return scope as Record<string, unknown>;
}
