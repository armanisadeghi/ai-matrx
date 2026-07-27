"use client";

/**
 * Build the `matrx-user/html-page` surface scope at trigger time.
 *
 * Mirrors `features/cms/hooks/useCmsPageSurfaceScope.ts`. Returns a
 * `() => SurfaceScopePayload` builder so every consumer reads live editor
 * state at click time.
 */

import { useCallback } from "react";
import type { RefObject } from "react";

import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  buildHtmlPageContextData,
  type HtmlPageEditorTab,
} from "../agent-context/buildHtmlPageContextData";
import type { HtmlPageRecord, HtmlPageSummary } from "../types";

export interface UseHtmlPageSurfaceScopeParams {
  page: HtmlPageRecord;
  siblingPages: readonly HtmlPageSummary[];
  /** Which tab is mounted — gates which buffer `content`/`selection` read from. */
  activeTab: HtmlPageEditorTab;
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
  /** Ref to the meta-description textarea — only meaningful when `activeTab === "meta"`. */
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}

export function useHtmlPageSurfaceScope(
  params: UseHtmlPageSurfaceScopeParams,
): () => SurfaceScopePayload {
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
    textareaRef,
  } = params;

  return useCallback(() => {
    // The ref is only meaningful for the tab it belongs to — reading it while
    // a different tab is mounted would pair a stale selection with the wrong
    // buffer (see buildHtmlPageContextData's activeTabContent).
    const ta = activeTab === "meta" ? textareaRef?.current : null;
    const selectionStart = ta?.selectionStart ?? 0;
    const selectionEnd = ta?.selectionEnd ?? selectionStart;

    return buildHtmlPageContextData({
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
      selectionStart,
      selectionEnd,
    }) as SurfaceScopePayload;
  }, [
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
    textareaRef,
  ]);
}
