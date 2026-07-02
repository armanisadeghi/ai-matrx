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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create page");
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    router.push(`/cms/${siteId}`);
  };

  // Stub handlers — create mode doesn't use save/draft/publish
  const notCreatedYet = (): never => {
    throw new Error("Page must be created first");
  };

  return (
    <PageEditor
      siteId={siteId}
      page={null}
      isSaving={isSaving}
      error={error}
      onSave={() => notCreatedYet()}
      onSaveDraft={() => notCreatedYet()}
      onPublish={() => notCreatedYet()}
      onDiscardDraft={() => notCreatedYet()}
      onCreate={handleCreate}
      onClose={handleClose}
    />
  );
}
