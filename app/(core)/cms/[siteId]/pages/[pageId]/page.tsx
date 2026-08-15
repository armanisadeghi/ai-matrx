"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { CmsPageService } from "@/features/cms/services/cmsService";
import type { ClientPage } from "@/features/cms/types";
import { Loader2 } from "lucide-react";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import PageEditor from "../../../../../../features/cms/components/PageEditor";
import { useSiteContext } from "../../SiteLayoutClient";

export default function EditPageRoute() {
  const { siteId, pageId } = useParams() as { siteId: string; pageId: string };
  const router = useRouter();
  const { site, pages, components, refreshPages } = useSiteContext();
  const [page, setPage] = useState<ClientPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    setError(null);
    try {
      const data = await CmsPageService.getPage(pageId);
      setPage(data);
    } catch (err: unknown) {
      setLoadError(err);
    } finally {
      setIsLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const handleSave = async (id: string, updates: Record<string, unknown>) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await CmsPageService.updatePage(id, updates);
      setPage(updated);
      void refreshPages();
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save page");
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async (
    id: string,
    draft: Record<string, unknown>,
  ) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await CmsPageService.saveDraft(id, draft);
      setPage(updated);
      void refreshPages();
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async (id: string) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await CmsPageService.publishDraft(id);
      setPage(updated);
      void refreshPages();
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish page");
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardDraft = async (id: string) => {
    setIsSaving(true);
    try {
      await CmsPageService.discardDraft(id);
      await fetchPage();
      void refreshPages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discard draft");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRollback = async (id: string, versionNumber: number) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await CmsPageService.rollbackToVersion(id, versionNumber);
      setPage(updated);
      void refreshPages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rollback page");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    router.push(`/cms/${siteId}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading page…</p>
        </div>
      </div>
    );
  }

  if (loadError || !page) {
    return (
      <AccessGate
        token="client_page"
        id={pageId}
        error={loadError}
        onRetry={() => void fetchPage()}
        fallbackHref="/cms"
        fallbackLabel="All Sites"
      />
    );
  }

  return (
    <PageEditor
      siteId={siteId}
      site={site}
      pages={pages}
      components={components}
      page={page}
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onSaveDraft={handleSaveDraft}
      onPublish={handlePublish}
      onDiscardDraft={handleDiscardDraft}
      onRollback={handleRollback}
      onCreate={async () => {
        throw new Error("Use /pages/new to create");
      }}
      onClose={handleClose}
      onRefetchPage={fetchPage}
    />
  );
}
