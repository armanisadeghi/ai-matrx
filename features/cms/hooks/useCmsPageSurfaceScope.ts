"use client";

/**
 * Build the `matrx-user/cms-page` surface scope at trigger time.
 *
 * Returns a `() => SurfaceScopePayload` builder rather than a static object —
 * mirrors `features/notes/hooks/useNotesSurfaceScope.ts`. CMS has no Redux
 * slice (see `features/cms/FEATURE.md`), so every input is a plain value
 * from the host's local editor state + the site-level cache
 * (`useSiteContext()`), not a selector.
 *
 * Wire-up pattern (see `PageEditor`'s `getApplicationScope`):
 *
 *   const buildSurfaceScope = useCmsPageSurfaceScope({ ... });
 *   ...
 *   const scope = buildApplicationScopeFromMenuContext({
 *     selectedText, selectionRange,
 *     contextData: buildSurfaceScope() as Record<string, unknown>,
 *   });
 */

import { useCallback } from "react";
import type { RefObject } from "react";

import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  buildCmsPageContextData,
  type CmsPageEditorTab,
} from "../agent-context/buildCmsPageContextData";
import type {
  ClientComponent,
  ClientEntityVersion,
  ClientPage,
  ClientPageSummary,
  ClientSite,
} from "../types";

export interface UseCmsPageSurfaceScopeParams {
  site: ClientSite;
  pages: readonly ClientPageSummary[];
  components: readonly ClientComponent[];
  /** null while creating a brand-new (unsaved) page. */
  page: ClientPage | null;
  activeTab: CmsPageEditorTab;
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
  /** Ref to whichever of the HTML/CSS/JS textareas is currently mounted (only one at a time). */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export function useCmsPageSurfaceScope(
  params: UseCmsPageSurfaceScopeParams,
): () => SurfaceScopePayload {
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
    textareaRef,
  } = params;

  return useCallback(() => {
    const ta = textareaRef.current;
    const selectionStart = ta?.selectionStart ?? 0;
    const selectionEnd = ta?.selectionEnd ?? selectionStart;

    return buildCmsPageContextData({
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
    }) as SurfaceScopePayload;
  }, [
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
    textareaRef,
  ]);
}
