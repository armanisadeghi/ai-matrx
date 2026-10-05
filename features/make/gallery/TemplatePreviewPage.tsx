"use client";

// features/make/gallery/TemplatePreviewPage.tsx — LANE MAKE-HOME, wave 4: the /make/templates/<id>
// page chrome (the shell header with Back, the scrolling body). Everything it shows is
// `TemplatePreview` (TemplateGallery.tsx), the one file that reaches the store.

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";

import { TemplatePreview } from "./TemplateGallery";

export default function TemplatePreviewPage({ templateId }: { templateId: string }) {
  return (
    <>
      <RecordPageHeader backHref="/make" record={{ name: "Template" }} />
      <div className="h-full overflow-y-auto overflow-x-hidden bg-textured">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-16 pt-[calc(var(--shell-header-h)+1.25rem)] sm:px-6">
          <TemplatePreview templateId={templateId} />
        </div>
      </div>
    </>
  );
}
