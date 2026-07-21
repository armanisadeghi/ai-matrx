"use client";

/**
 * features/media-capture/components/CameraPage.tsx
 *
 * The /camera route body: Capture Studio (photo mode) + a minimal
 * recent-captures lens over the EXISTING files data layer (cloud-files tree +
 * `useFolderContents` — no second query stack, no ad hoc `.from()` calls),
 * filtered to the `Captures/Photos` folder and rendered via `<InlineMediaRef>`
 * by file_id. Phase 8 expands this into the full list page.
 */

import { useMemo, useState } from "react";
import { Camera, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectAllFoldersMap } from "@/features/files/redux/selectors";
import { useCloudTree } from "@/features/files/hooks/useCloudTree";
import { useFolderContents } from "@/features/files/hooks/useFolderContents";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { CaptureStudio } from "@/features/media-capture/components/CaptureStudio";

export default function CameraPage() {
  const [studioOpen, setStudioOpen] = useState(true);
  // Bumped on save so the lens reflects the new row even if realtime lags.
  const [, setSaveCount] = useState(0);

  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2">
          <Camera className="h-4 w-4 shrink-0 text-primary" />
          <h1 className="truncate text-sm font-semibold">Camera</h1>
          {!studioOpen && (
            <Button
              size="sm"
              className="ml-auto h-8"
              onClick={() => setStudioOpen(true)}
            >
              <Camera className="mr-1.5 h-4 w-4" />
              New capture
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="h-full overflow-hidden bg-textured">
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 pt-[var(--shell-header-h)]">
          {studioOpen && (
            <div className="min-h-[320px] shrink-0 md:min-h-[420px]">
              <CaptureStudio
                sourceFeature="camera"
                onSaved={() => setSaveCount((n) => n + 1)}
              />
            </div>
          )}
          <RecentCaptures />
        </div>
      </div>
    </>
  );
}

function RecentCaptures() {
  const userId = useAppSelector(selectUserId);
  const { status } = useCloudTree(userId);
  const foldersById = useAppSelector(selectAllFoldersMap);

  const photosFolderId = useMemo(() => {
    for (const folder of Object.values(foldersById)) {
      if (folder?.folderPath === CloudFolders.CAPTURES_PHOTOS) return folder.id;
    }
    return null;
  }, [foldersById]);

  const { files, loading } = useFolderContents(photosFolderId);

  const recent = useMemo(
    () =>
      [...files]
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
        .slice(0, 24),
    [files],
  );

  return (
    <section className="shrink-0">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Recent captures
      </h2>
      {status === "loading" || (photosFolderId && loading) ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-md" />
          ))}
        </div>
      ) : !photosFolderId || recent.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          <ImageOff className="h-4 w-4" />
          No captures yet — photos you save land in Captures/Photos.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {recent.map((file) => (
            <div key={file.id} className="aspect-square overflow-hidden">
              <InlineMediaRef ref={file.id} size="fill" alt={file.fileName} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
