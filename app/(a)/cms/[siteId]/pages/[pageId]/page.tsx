"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { CmsPageService } from "@/features/cms/services/cmsService";
import type { ClientPage } from "@/features/cms/types";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageEditor from "../../../../../../features/cms/components/PageEditor";

export default function EditPageRoute() {
  const { siteId, pageId } = useParams() as { siteId: string; pageId: string };
  const router = useRouter();
  const [page, setPage] = useState<ClientPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await CmsPageService.getPage(pageId);
      setPage(data);
    } catch (err: any) {
      setError(err.message);
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
      return updated;
    } catch (err: any) {
      setError(err.message);
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
      return updated;
    } catch (err: any) {
      setError(err.message);
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
      return updated;
    } catch (err: any) {
      setError(err.message);
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
    } catch (err: any) {
      setError(err.message);
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

  if (error && !page) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-destructive">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm font-medium">Failed to load page</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleClose}>
              ← Back
            </Button>
            <Button variant="outline" size="sm" onClick={fetchPage}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PageEditor
      siteId={siteId}
      page={page}
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onSaveDraft={handleSaveDraft}
      onPublish={handlePublish}
      onDiscardDraft={handleDiscardDraft}
      onCreate={async () => {
        throw new Error("Use /pages/new to create");
      }}
      onClose={handleClose}
    />
  );
}
