/**
 * components/ui/file-upload/PasteImageHandler.tsx
 *
 * Attach a clipboard-paste listener to a target element and upload any
 * pasted image through the universal handler. The previous
 * `usePasteImageUpload` hook was deleted in Phase 1 of the file-handling
 * consolidation; its paste-event + bucket-mapping logic now lives in this
 * component (which is its only consumer in real code, plus an admin demo).
 *
 * The bucket / path / saveTo prop trio is preserved verbatim so call sites
 * keep working without edits. Internally every paste routes through
 * `useFileUpload().upload` from `@/features/files/handler`.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useFileUpload } from "@/features/files";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import type { Visibility } from "@/features/files/types";

type SaveToOption = "public" | "private";

/**
 * Shape passed to `onImagePasted`. `url` is the embeddable direct-file
 * URL (Python's `/share/{token}` resolver) — drop into `<img src>`,
 * `<video>`, `<a href>`, etc.
 *
 * `pageUrl` is the optional HTML landing page (`/share/<token>`) for
 * "click here to view file metadata" surfaces. `fileId` is the
 * canonical cld_files UUID — prefer it for AI API calls.
 */
export interface PasteImageUploadResult {
  url: string;
  type: string;
  fileId?: string;
  pageUrl?: string;
}

type PasteImageHandlerProps = {
  /** Legacy bucket name; mapped to a top-level cld_files folder. */
  bucket?: string;
  /** Sub-folder under the bucket-mapped top-level folder. */
  path?: string;
  /** Override visibility. Default: "public" if `saveTo === 'public'`, else "private". */
  saveTo?: SaveToOption;
  onImagePasted?: (result: PasteImageUploadResult) => void;
  targetElement?: HTMLElement | null;
  disabled?: boolean;
  children?: React.ReactNode;
  onProcessingChange?: (isProcessing: boolean) => void;
  /** Called when the upload fails. If omitted, a toast shows the error. */
  onError?: (message: string) => void;
};

function mapLegacyBucket(bucket: string): string {
  switch (bucket) {
    case "user-public-assets":
      return "Shared Assets";
    case "user-private-assets":
      return "Private Assets";
    case "images":
    case "Images":
      return CloudFolders.IMAGES;
    case "audio":
    case "Audio":
      return CloudFolders.AUDIO;
    case "audio-recordings":
      return CloudFolders.AUDIO_RECORDINGS;
    case "documents":
    case "Documents":
      return CloudFolders.DOCUMENTS;
    case "code":
    case "Code":
      return CloudFolders.CODE;
    case "userContent":
      return "My Files";
    case "any-file":
      return "Uploads";
    case "attachments":
      return CloudFolders.CHAT_ATTACHMENTS;
    default:
      return bucket;
  }
}

function classifyFileType(mimeType: string): string {
  if (!mimeType) return "unknown";
  const t = mimeType.toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("text/") || t === "application/json") return "text";
  if (t === "application/pdf") return "pdf";
  return "other";
}

export const PasteImageHandler: React.FC<PasteImageHandlerProps> = ({
  bucket = "userContent",
  path,
  saveTo,
  onImagePasted,
  targetElement,
  disabled = false,
  children,
  onProcessingChange,
  onError,
}) => {
  const localRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(targetElement || null);
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);
  const { upload } = useFileUpload();

  useEffect(() => {
    if (targetElement) {
      targetRef.current = targetElement;
    } else if (localRef.current) {
      targetRef.current = localRef.current;
    }
  }, [targetElement]);

  const updateProcessing = useCallback(
    (processing: boolean) => {
      isProcessingRef.current = processing;
      setIsProcessing(processing);
      onProcessingChange?.(processing);
    },
    [onProcessingChange],
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      if (disabled || isProcessingRef.current) return;
      const items = event.clipboardData?.items;
      if (!items) return;

      const top = mapLegacyBucket(bucket);
      const sub = (path ?? "").replace(/^\/+|\/+$/g, "");
      const folderPath = sub ? `${top}/${sub}` : top;
      const visibility: Visibility =
        saveTo === "public"
          ? "public"
          : saveTo === "private"
            ? "private"
            : bucket === "user-public-assets"
              ? "public"
              : "private";

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf("image") === -1) continue;

        event.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        updateProcessing(true);
        try {
          const fileName = `pasted_image_${Date.now()}.png`;
          const namedFile = new File([file], fileName, { type: file.type });
          const normalized = await upload(
            { kind: "file", file: namedFile },
            {
              folderPath,
              visibility,
              createShareLink: true,
              shareLinkPermissionLevel: "read",
            },
          );
          const result: PasteImageUploadResult = {
            url: normalized.url ?? "",
            type: classifyFileType(file.type),
            fileId: normalized.fileId,
            pageUrl: normalized.shareToken
              ? `/share/${normalized.shareToken}`
              : undefined,
          };
          onImagePasted?.(result);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Upload failed";
          // eslint-disable-next-line no-console
          console.error("Error processing pasted image:", error);
          if (onError) onError(reason);
          else toast.error(`Couldn't upload pasted image: ${reason}`);
        } finally {
          updateProcessing(false);
        }
      }
    },
    [disabled, bucket, path, saveTo, upload, onImagePasted, onError, updateProcessing],
  );

  useEffect(() => {
    const element = targetRef.current;
    if (!element || disabled) return;
    element.addEventListener("paste", handlePaste as EventListener);
    return () => {
      element.removeEventListener("paste", handlePaste as EventListener);
    };
  }, [handlePaste, disabled]);

  // Silence unused-variable warning when external target is provided; the
  // hook above still tracks state in case future call sites read it.
  void isProcessing;

  if (targetElement) {
    return null;
  }

  return (
    <div ref={localRef} style={{ width: "100%", height: "100%" }}>
      {children}
    </div>
  );
};

export default PasteImageHandler;
