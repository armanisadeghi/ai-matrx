"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import {
  ImageAssetUploader,
  type ImageUploaderResult,
} from "@/components/official/ImageAssetUploader";
import { CloudFolders } from "@/features/files";
import type { ImageSource } from "@/features/image-studio/modes/shared/types";

const EditModeShell = dynamic(
  () =>
    import("@/features/image-studio/modes/edit/EditModeShell").then((m) => ({
      default: m.EditModeShell,
    })),
  { ssr: false },
);

interface Props {
  urlParam: string | null;
  cloudFileId: string | null;
  folder?: string;
}

export default function EditShellClient({
  urlParam,
  cloudFileId,
  folder,
}: Props) {
  const initial = useMemo<ImageSource | null>(() => {
    if (urlParam) return { kind: "url", url: urlParam };
    if (cloudFileId) return { kind: "cloudFileId", cloudFileId };
    return null;
  }, [urlParam, cloudFileId]);

  const [source, setSource] = useState<ImageSource | null>(initial);

  const handleUploadedSource = (result: ImageUploaderResult | null) => {
    if (!result?.primary_url) return;
    setSource({ kind: "url", url: result.primary_url });
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 bg-background">
      {source ? (
        <EditModeShell
          source={source}
          defaultFolder={folder ?? "Images/Edited"}
          presentation="page"
        />
      ) : (
        <div className="h-full overflow-y-auto overscroll-contain flex items-start md:items-center justify-center p-3 md:p-6">
          <div className="w-full max-w-xl flex flex-col gap-4 md:gap-5">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-semibold">Pick an image to edit</h2>
              <p className="text-xs text-muted-foreground">
                Upload or paste a URL, then continue into the editor.
              </p>
            </div>

            <ImageAssetUploader
              onComplete={handleUploadedSource}
              preset="raw"
              folder={CloudFolders.IMAGES_EDITED_SOURCES}
              visibility="private"
              label="Edit source"
              allowUrlPaste
              compact={false}
              hideVariantBadges
            />

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5" />
              <span>or</span>
              <Link href="/files" className="underline hover:text-foreground">
                pick from your Cloud Files
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
