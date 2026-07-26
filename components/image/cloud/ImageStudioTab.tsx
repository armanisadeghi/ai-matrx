/**
 * components/image/cloud/ImageStudioTab.tsx
 *
 * Tab wrapper that embeds the full `<EmbeddedImageStudio>` pipeline
 * (drop → crop → generate → save → public CDN URLs) and pipes the
 * resulting URLs back into the SelectedImagesProvider so the picker
 * can finalize a selection.
 *
 * Defaults presets to OG and IG-Square — both sensible "image manager"
 * outputs — but callers can override via `imageStudioProps`.
 */

"use client";

import React, { useCallback } from "react";
import { useAppStore } from "@/lib/redux/hooks";
import { EmbeddedImageStudio } from "@/features/image-studio/components/EmbeddedImageStudio";
import type {
  EmbeddedImageStudioProps,
  EmbeddedImageStudioResult,
} from "@/features/image-studio/components/EmbeddedImageStudio";
import {
  useSelectedImages,
  type ImageSource,
} from "@/components/image/context/SelectedImagesProvider";
import type { CloudFileRecord } from "@/features/files";

const DEFAULT_PRESET_IDS = ["og-image", "ig-square"];
const DEFAULT_PRIMARY_PRESET = "og-image";
const DEFAULT_ROOT_SEGMENT = "image-manager";

export interface ImageStudioTabProps {
  /** Override any aspect of the embedded studio. */
  imageStudioProps?: Partial<EmbeddedImageStudioProps>;
  /**
   * When true, after a successful save we add EVERY generated preset URL
   * to the selection (not just the primary). Default `false` — only the
   * primary is added.
   */
  selectAllVariants?: boolean;
}

export function ImageStudioTab({
  imageStudioProps,
  selectAllVariants,
}: ImageStudioTabProps) {
  const store = useAppStore();
  const { addImage, clearImages, selectionMode } = useSelectedImages();

  const handleSaved = useCallback(
    (result: EmbeddedImageStudioResult) => {
      if (selectionMode === "single") {
        clearImages();
      }

      const entries = Object.entries(result.byPreset);
      if (!entries.length && !result.primary) return;

      const toAdd: ImageSource[] = [];

      if (selectAllVariants) {
        for (const [presetId, url] of entries) {
          toAdd.push({
            type: "cloud-file",
            url,
            id: `studio:${result.filenameBase}:${presetId}`,
            metadata: {
              title: `${result.filenameBase} (${presetId})`,
              description: `Image Studio variant: ${presetId}`,
              mimeType: inferMimeFromUrl(url),
              urlExpiresAt: null,
            },
          });
        }
      } else if (result.primary) {
        // Try to enrich with file metadata if we can find the cloud-file
        // record for this URL. The studio doesn't return file ids, so this
        // is best-effort.
        const file = findFileByPublicUrl(store, result.primary.publicUrl);
        toAdd.push({
          type: "cloud-file",
          url: result.primary.publicUrl,
          id: file
            ? `cloud:${file.id}`
            : `studio:${result.filenameBase}:${result.primary.presetId}`,
          metadata: {
            title: `${result.filenameBase} (${result.primary.presetId})`,
            description: `Image Studio: ${result.primary.presetId}`,
            fileId: file?.id,
            mimeType:
              file?.mimeType ?? inferMimeFromUrl(result.primary.publicUrl),
            fileSize: file?.fileSize ?? undefined,
            urlExpiresAt: null,
          },
        });
      }

      for (const source of toAdd) {
        addImage(source);
        if (selectionMode === "single") break;
      }
    },
    [addImage, clearImages, selectionMode, selectAllVariants, store],
  );

  return (
    <div className="h-full overflow-auto p-4">
      <EmbeddedImageStudio
        presetIds={imageStudioProps?.presetIds ?? DEFAULT_PRESET_IDS}
        primaryPresetId={
          imageStudioProps?.primaryPresetId ?? DEFAULT_PRIMARY_PRESET
        }
        rootFolderSegment={
          imageStudioProps?.rootFolderSegment ?? DEFAULT_ROOT_SEGMENT
        }
        defaultFilenameBase={imageStudioProps?.defaultFilenameBase ?? "image"}
        initialUrl={imageStudioProps?.initialUrl ?? null}
        label={imageStudioProps?.label}
        hideTitle
        disabled={imageStudioProps?.disabled}
        className={imageStudioProps?.className}
        onSaved={(result) => {
          imageStudioProps?.onSaved?.(result);
          handleSaved(result);
        }}
        onCleared={imageStudioProps?.onCleared}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFileByPublicUrl(
  store: ReturnType<typeof useAppStore>,
  url: string,
): CloudFileRecord | null {
  const state = store.getState();
  const filesById = state.cloudFiles?.filesById ?? {};
  for (const file of Object.values(filesById) as CloudFileRecord[]) {
    if (file.publicUrl && url.startsWith(file.publicUrl)) {
      return file;
    }
  }
  return null;
}

function inferMimeFromUrl(url: string): string | undefined {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "avif") return "image/avif";
  if (ext === "svg") return "image/svg+xml";
  return undefined;
}
