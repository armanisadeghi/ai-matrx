"use client";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { CmsArtifactList } from "@/features/artifacts/components/CmsArtifactList";

export default function ArtifactsPage() {
  return (
    <>
      <RouteHeader
        left={
          <h1 className="ml-2 text-sm font-medium text-foreground truncate">
            Content Library
          </h1>
        }
      />
      <div className="h-full overflow-y-auto bg-textured px-4 sm:px-6 pb-6 pt-[calc(var(--shell-header-h)+0.75rem)]">
        <div className="max-w-[1600px] mx-auto">
          <CmsArtifactList />
        </div>
      </div>
    </>
  );
}
