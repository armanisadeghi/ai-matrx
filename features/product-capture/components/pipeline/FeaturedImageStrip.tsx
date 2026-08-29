"use client";

/**
 * FeaturedImageStrip — designate the item's featured image (drives the
 * mobile Q&A queue and thumbnails) and optionally CROP a new featured shot
 * from any photo, reusing the canonical image-studio crop stack
 * (`InitialCropWindow` — the production cropper; never a rebuilt one). The
 * cropped result uploads through the feature's ONE cloud boundary
 * (`uploadItemFile` → org-visible, item folder, linked) and becomes featured.
 */

import React, { useState } from "react";
import { Crop, Loader2, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InitialCropWindow } from "@/features/image-studio/components/InitialCropWindow";
import { fileHandler } from "@/features/files/handler/handler";
import { SelectableFileThumbnail } from "@/features/files/components/preview/SelectableFileThumbnail";
import { toast } from "@/lib/toast";

import type { CaptureFile } from "../../types";
import type { PipelineItem } from "../../pipeline-service";
import { uploadItemFile } from "../../uploads";

export function FeaturedImageStrip({
  item,
  files,
  onSetFeatured,
  onFileAdded,
}: {
  item: PipelineItem;
  files: CaptureFile[];
  onSetFeatured: (fileId: string | null) => Promise<void>;
  /** A cropped featured image was uploaded + linked — refresh file lists. */
  onFileAdded: (file: CaptureFile) => void;
}) {
  const photos = files.filter((f) => f.kind === "photo");
  const featuredFileId = item.featuredFileId;
  const [cropSource, setCropSource] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const startCrop = async (fileId: string) => {
    setBusy(true);
    try {
      // File ID stays authoritative all the way to authenticated bytes.
      const blob = await fileHandler
        .use({ kind: "file_id", fileId })
        .as({ kind: "blob" });
      setCropSource([
        new File([blob], `featured-${Date.now()}.jpg`, {
          type: blob.type || "image/jpeg",
        }),
      ]);
    } catch (err) {
      console.error("[product-pipeline] crop source failed", err);
      toast.error("Could not open the image for cropping.");
    } finally {
      setBusy(false);
    }
  };

  const onCropComplete = (results: File[]) => {
    setCropSource([]);
    const cropped = results[0];
    if (!cropped) return;
    setBusy(true);
    void uploadItemFile({ item, file: cropped, kind: "photo" })
      .then(async ({ link }) => {
        onFileAdded(link);
        await onSetFeatured(link.fileId);
        toast.success("Cropped featured image set.");
      })
      .catch((err: unknown) => {
        console.error("[product-pipeline] featured crop upload failed", err);
        toast.error("Could not save the cropped image.");
      })
      .finally(() => setBusy(false));
  };

  return (
    <div>
      <p className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        Featured image
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      </p>
      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photos yet.</p>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {photos.map((file) => {
            const isFeatured = item.featuredFileId === file.fileId;
            return (
              <SelectableFileThumbnail
                key={file.id}
                fileId={file.fileId}
                selected={isFeatured}
                onSelectedChange={(nextSelected) =>
                  onSetFeatured(nextSelected ? file.fileId : null)
                }
                alt="Product photo"
                selectLabel="Set as featured image"
                clearLabel="Clear featured image"
                selectedIcon={<Star className="h-5 w-5 fill-current" />}
                unselectedIcon={<Star className="h-5 w-5" />}
                disabled={busy}
                className="mx-1 mb-2"
              />
            );
          })}
          {featuredFileId && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              disabled={busy}
              onClick={() => void startCrop(featuredFileId)}
            >
              <Crop className="mr-1 h-3.5 w-3.5" />
              Crop featured
            </Button>
          )}
        </div>
      )}

      <InitialCropWindow
        files={cropSource}
        onComplete={onCropComplete}
        onCancel={() => setCropSource([])}
        instanceId={`featured-crop-${item.id}`}
      />
    </div>
  );
}
