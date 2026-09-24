"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileName } from "@/features/files/redux/selectors";
import { useMediaResolution } from "@ai-matrx/media/core";
import type { ImageSource } from "@/features/image-studio/modes/shared/types";

const EditModeShell = dynamic(
  () =>
    import("@/features/image-studio/modes/edit/EditModeShell").then((m) => ({
      default: m.EditModeShell,
    })),
  { ssr: false },
);

interface Props {
  cloudFileId: string;
  folder?: string;
}

/**
 * Resolve the file id to a renderable URL through the universal handler.
 * `useFileSrc` returns the best URL for the file's visibility — a permanent
 * CDN URL for public files, a freshly-minted signed URL for private ones —
 * so Filerobot always loads through the CDN when one exists and never
 * re-uses a stale signed URL. (The earlier crossOrigin pre-probe was
 * removed: it blocked the editor for tens of seconds on private files whose
 * signed S3 URLs are perfectly loadable but don't echo CORS headers for a
 * HEAD-style anonymous probe.)
 */
export default function EditByIdClient({ cloudFileId, folder }: Props) {
  const media = useMediaResolution(cloudFileId);
  const url = media.resolution?.src ?? null;
  const fileName = useAppSelector((s) => selectFileName(s, cloudFileId));

  // The resolver refused the file (denied, deleted, missing). Without this the
  // page spun "Loading image…" forever. The gate asks the platform which state
  // it is and offers the way forward.
  if (media.status === "unavailable") {
    return (
      <div className="h-full w-full overflow-hidden bg-background">
        <AccessGate
          token="file"
          id={cloudFileId}
          fallbackHref="/images"
          fallbackLabel="Your images"
        />
      </div>
    );
  }

  if (!url) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading image…
        </div>
      </div>
    );
  }

  const source: ImageSource = {
    kind: "url",
    url,
    suggestedFilename: fileName ?? "image",
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 bg-background">
      {/* key forces a full remount when the file id changes (e.g. after
          "Save as duplicate" navigates to the new file) so the editor's
          internal state never points at the previous file. */}
      <EditModeShell
        key={cloudFileId}
        source={source}
        cloudFileId={cloudFileId}
        defaultFolder={folder ?? "Images/Edited"}
        presentation="page"
      />
    </div>
  );
}
