"use client";

import { useCallback, useEffect, useState } from "react";
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";
import type {
  HtmlPageMetaFields,
  HtmlPageRecord,
  HtmlPageSummary,
} from "@/features/html-pages/types";

/**
 * Management hook for the user's standalone `html_pages` (list + CRUD).
 * Local state only — mirrors `useCmsPages`, not Redux.
 */
export function useHtmlPagesManager() {
  const [pages, setPages] = useState<HtmlPageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = (await HTMLPageService.getUserPages()) as HtmlPageSummary[];
      setPages(list ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pages");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const getPage = useCallback(
    async (pageId: string): Promise<HtmlPageRecord> => {
      return (await HTMLPageService.getPage(pageId)) as HtmlPageRecord;
    },
    [],
  );

  const createPage = useCallback(
    async (params: {
      htmlContent: string;
      metaTitle: string;
      metaDescription?: string;
      metaFields?: HtmlPageMetaFields;
      forceNew?: boolean;
    }): Promise<{ pageId: string; url: string }> => {
      setIsSaving(true);
      setError(null);
      try {
        const result = await HTMLPageService.createPage(
          params.htmlContent,
          params.metaTitle,
          params.metaDescription ?? "",
          undefined,
          params.metaFields ?? {},
          params.forceNew ? { forceNew: true } : {},
        );
        await refresh();
        return result as { pageId: string; url: string };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create page";
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [refresh],
  );

  const updatePage = useCallback(
    async (
      pageId: string,
      updates: {
        htmlContent?: string;
        metaTitle?: string;
        metaDescription?: string;
        metaFields?: HtmlPageMetaFields;
      },
    ) => {
      setIsSaving(true);
      setError(null);
      try {
        const result = await HTMLPageService.updatePage(
          pageId,
          updates.htmlContent,
          updates.metaTitle,
          updates.metaDescription,
          undefined,
          updates.metaFields ?? {},
        );
        await refresh();
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update page";
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [refresh],
  );

  const deletePage = useCallback(async (pageId: string) => {
    setError(null);
    try {
      await HTMLPageService.deletePage(pageId);
      setPages((prev) => prev.filter((p) => p.id !== pageId));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete page";
      setError(message);
      throw err;
    }
  }, []);

  return {
    pages,
    isLoading,
    isSaving,
    error,
    refresh,
    getPage,
    createPage,
    updatePage,
    deletePage,
    clearError: () => setError(null),
  };
}
