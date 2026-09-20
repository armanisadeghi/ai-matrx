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
      <div className="h-full overflow-y-auto bg-textured px-3 sm:px-5 pb-6 pt-[calc(var(--shell-header-h)+0.5rem)]">
        <div className="mx-auto max-w-[1100px]">
          <CmsArtifactList />
        </div>
      </div>
    </>
  );
}
