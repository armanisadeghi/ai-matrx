"use client";

import { PageSpecificHeader } from "@/components/layout/new-layout/PageSpecificHeader";
import { LayoutGrid } from "lucide-react";
import { CmsArtifactList } from "@/features/artifacts/components/CmsArtifactList";

export default function CmsPage() {
  return (
    <>
      <PageSpecificHeader>
        <div className="flex items-center justify-center w-full">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary flex-shrink-0" />
            <h1 className="text-base font-bold text-foreground">
              Content Library
            </h1>
          </div>
        </div>
      </PageSpecificHeader>

      <div className="h-[calc(100dvh-var(--header-height)*2)] w-full overflow-auto bg-textured">
        <div className="container mx-auto px-4 sm:px-6 md:px-8 py-6 max-w-[1600px]">
          <CmsArtifactList />
        </div>
      </div>
    </>
  );
}
