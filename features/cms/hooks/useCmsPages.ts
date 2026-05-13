"use client";

import { useState, useCallback } from "react";
import { CmsPageService } from "../services/cmsService";
import type { ClientPage, ClientPageSummary } from "../types";

export function useCmsPages(siteId: string | null) {
  const [pages, setPages] = useState<ClientPageSummary[]>([]);
  const [activePage, setActivePage] = useState<ClientPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── List ──────────────────────────────────────────────────────────────

  const fetchPages = useCallback(
    async (category?: string) => {
      if (!siteId) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await CmsPageService.listPages(siteId, category);
        setPages(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [siteId],
  );

  // ── Get (full page content) ──────────────────────────────────────────

  const openPage = useCallback(async (pageId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const page = await CmsPageService.getPage(pageId);
      setActivePage(page);
      return page;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const closePage = useCallback(() => {
    setActivePage(null);
  }, []);

  // ── Create ───────────────────────────────────────────────────────────

  const createPage = useCallback(
    async (params: Parameters<typeof CmsPageService.createPage>[0]) => {
      setIsSaving(true);
      setError(null);
      try {
        const page = await CmsPageService.createPage(params);
        setPages((prev) => [
          {
            id: page.id,
            slug: page.slug,
            title: page.title,
            category: page.category,
            page_type: page.page_type,
            is_published: page.is_published,
            has_draft: page.has_draft,
            is_home_page: page.is_home_page,
            show_in_nav: page.show_in_nav,
            sort_order: page.sort_order,
            excerpt: page.excerpt ?? null,
            featured_image: page.featured_image ?? null,
            author: page.author ?? null,
            tags: page.tags ?? null,
            meta_title: page.meta_title ?? null,
            meta_description: page.meta_description ?? null,
            publish_date: page.publish_date ?? null,
            last_published_at: page.last_published_at ?? null,
            updated_at: page.updated_at,
            created_at: page.created_at,
          },
          ...prev,
        ]);
        setActivePage(page);
        return page;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  // ── Update ───────────────────────────────────────────────────────────

  const updatePage = useCallback(
    async (pageId: string, updates: Record<string, unknown>) => {
      setIsSaving(true);
      setError(null);
      try {
        const page = await CmsPageService.updatePage(pageId, updates);
        setPages((prev) =>
          prev.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  title: page.title,
                  slug: page.slug,
                  category: page.category,
                  page_type: page.page_type,
                  is_published: page.is_published,
                  has_draft: page.has_draft,
                  show_in_nav: page.show_in_nav,
                  sort_order: page.sort_order,
                  updated_at: page.updated_at,
                }
              : p,
          ),
        );
        if (activePage?.id === pageId) setActivePage(page);
        return page;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [activePage],
  );

  // ── Delete ───────────────────────────────────────────────────────────

  const deletePage = useCallback(
    async (pageId: string) => {
      setError(null);
      try {
        await CmsPageService.deletePage(pageId);
        setPages((prev) => prev.filter((p) => p.id !== pageId));
        if (activePage?.id === pageId) setActivePage(null);
      } catch (err: any) {
        setError(err.message);
        throw err;
      }
    },
    [activePage],
  );

  // ── Draft workflow ───────────────────────────────────────────────────

  const saveDraft = useCallback(
    async (
      pageId: string,
      draft: Parameters<typeof CmsPageService.saveDraft>[1],
    ) => {
      setIsSaving(true);
      setError(null);
      try {
        const page = await CmsPageService.saveDraft(pageId, draft);
        setPages((prev) =>
          prev.map((p) =>
            p.id === pageId
              ? { ...p, has_draft: true, updated_at: page.updated_at }
              : p,
          ),
        );
        if (activePage?.id === pageId) setActivePage(page);
        return page;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [activePage],
  );

  const publishDraft = useCallback(
    async (pageId: string) => {
      setIsSaving(true);
      setError(null);
      try {
        const page = await CmsPageService.publishDraft(pageId);
        setPages((prev) =>
          prev.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  is_published: true,
                  has_draft: false,
                  updated_at: page.updated_at,
                }
              : p,
          ),
        );
        if (activePage?.id === pageId) setActivePage(page);
        return page;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [activePage],
  );

  const discardDraft = useCallback(
    async (pageId: string) => {
      setError(null);
      try {
        await CmsPageService.discardDraft(pageId);
        setPages((prev) =>
          prev.map((p) => (p.id === pageId ? { ...p, has_draft: false } : p)),
        );
        // Re-fetch the active page to get clean state
        if (activePage?.id === pageId) {
          const page = await CmsPageService.getPage(pageId);
          setActivePage(page);
        }
      } catch (err: any) {
        setError(err.message);
        throw err;
      }
    },
    [activePage],
  );

  const rollbackToVersion = useCallback(
    async (pageId: string, versionNumber: number) => {
      setIsSaving(true);
      setError(null);
      try {
        const page = await CmsPageService.rollbackToVersion(
          pageId,
          versionNumber,
        );
        if (activePage?.id === pageId) setActivePage(page);
        return page;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [activePage],
  );

  return {
    pages,
    activePage,
    isLoading,
    isSaving,
    error,
    fetchPages,
    openPage,
    closePage,
    createPage,
    updatePage,
    deletePage,
    saveDraft,
    publishDraft,
    discardDraft,
    rollbackToVersion,
    clearError: () => setError(null),
  };
}
