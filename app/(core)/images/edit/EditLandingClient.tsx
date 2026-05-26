"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  ImageAssetUploader,
  type ImageUploaderResult,
} from "@/components/official/ImageAssetUploader";
import { Button } from "@/components/ui/button";
import { CloudFolders } from "@/features/files";
import { fileHandler } from "@/features/files/handler/handler";
import { openFilePicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";

const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "avif", "heic"];

interface Props {
  folder?: string;
}

export default function EditLandingClient({ folder }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const goToEditor = useCallback(
    (fileId: string) => {
      const qs = folder ? `?folder=${encodeURIComponent(folder)}` : "";
      router.replace(`/images/edit/${fileId}${qs}`);
    },
    [folder, router],
  );

  const handleUploaderResult = useCallback(
    (result: ImageUploaderResult | null) => {
      if (!result?.file_id) return;
      goToEditor(result.file_id);
    },
    [goToEditor],
  );

  const handlePickFromCloud = useCallback(async () => {
    setBusy(true);
    try {
      const ids = await openFilePicker({
        allowedExtensions: IMAGE_EXTS,
        title: "Choose an image",
        description: "Pick an image from your cloud files to edit.",
      });
      if (ids && ids[0]) {
        goToEditor(ids[0]);
      }
    } finally {
      setBusy(false);
    }
  }, [goToEditor]);

  // Image paste (Ctrl/Cmd+V) — intercepts binary clipboard images and uploads.
  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      if (busy) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (!blob) continue;
          e.preventDefault();
          setBusy(true);
          try {
            const ext = item.type.split("/")[1]?.split("+")[0] ?? "png";
            const file = new File(
              [blob],
              `pasted-${Date.now()}.${ext}`,
              { type: item.type },
            );
            const normalized = await fileHandler.upload(
              { kind: "file", file },
              {
                folderPath: CloudFolders.IMAGES_EDITED_SOURCES,
                visibility: "private",
                metadata: { kind: "edit-source", origin: "paste" },
              },
            );
            if (normalized.fileId) {
              goToEditor(normalized.fileId);
            } else {
              toast.error("Pasted image upload returned no file id.");
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Paste upload failed";
            toast.error(msg);
          } finally {
            setBusy(false);
          }
          return;
        }
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [busy, goToEditor]);

  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain flex items-start md:items-center justify-center p-3 md:p-6 bg-background">
      <div className="w-full max-w-xl flex flex-col gap-4 md:gap-5">
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold">Pick an image to edit</h2>
          <p className="text-xs text-muted-foreground">
            Upload, paste a URL or image, drag a file in, or open one from your
            cloud files. We'll save it for you and jump into the editor.
          </p>
        </div>

        <ImageAssetUploader
          onComplete={handleUploaderResult}
          preset="raw"
          folder={CloudFolders.IMAGES_EDITED_SOURCES}
          visibility="private"
          label="Edit source"
          allowUrlPaste
          compact={false}
          hideVariantBadges
          disabled={busy}
        />

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <Button
          variant="outline"
          size="default"
          onClick={() => void handlePickFromCloud()}
          disabled={busy}
          className="w-full justify-center gap-2"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FolderOpen className="h-4 w-4" />
          )}
          Pick from your cloud files
        </Button>

        <p className="text-center text-[11px] text-muted-foreground">
          Tip: paste an image with{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">
            ⌘V
          </kbd>{" "}
          /{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">
            Ctrl+V
          </kbd>
          .
        </p>
      </div>
    </div>
  );
}
