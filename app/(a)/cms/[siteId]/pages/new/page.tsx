"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CmsPageService } from "@/features/cms/services/cmsService";
import PageEditor from "@/features/cms/components/PageEditor";

export default function NewPageRoute() {
  const { siteId } = useParams() as { siteId: string };
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (params: Record<string, unknown>) => {
    setIsSaving(true);
    setError(null);
    try {
      const newPage = await CmsPageService.createPage({
        siteId,
        slug: "",
        title: "",
        ...params,
      });
      // Navigate to the new page's editor
      router.push(`/cms/${siteId}/pages/${newPage.id}`);
      return newPage;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    router.push(`/cms/${siteId}`);
  };

  // Stub handlers — create mode doesn't use save/draft/publish
  const noop = async () => {
    throw new Error("Page must be created first");
  };

  return (
    <PageEditor
      siteId={siteId}
      page={null}
      isSaving={isSaving}
      error={error}
      onSave={noop as any}
      onSaveDraft={noop as any}
      onPublish={noop as any}
      onDiscardDraft={noop as any}
      onCreate={handleCreate}
      onClose={handleClose}
    />
  );
}
