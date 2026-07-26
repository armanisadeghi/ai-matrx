/**
 * components/ui/file-upload/PasteImageHandler.tsx
 *
 * Attach a clipboard-paste listener to a target element and upload any
 * pasted image through the universal handler. The previous
 * `usePasteImageUpload` hook was deleted in Phase 1 of the file-handling
 * consolidation; its paste-event and folder-routing logic now live in this
 * component (which is its only consumer in real code, plus an admin demo).
 *
 * The root / path / visibility inputs route every paste through
 * `useFileUpload().upload` from `@/features/files/handler`.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { composeUploadFolderPath } from "@/features/files/handler/utils/upload-folder-path";
import type { Visibility } from "@/features/files/types";

type SaveToOption = "public" | "personal";

/**
 * Shape passed to `onImagePasted`. `url` is the embeddable direct-file
 * URL (Python's `/share/{token}` endpoint) — drop into `<img src>`,
 * `<video>`, `<a href>`, etc.
 *
 * `pageUrl` is the optional HTML landing page (`/s/<token>`) for
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
  /** Logical top-level Files folder. */
  folderRoot?: string;
  /** Sub-folder under the top-level folder. */
  path?: string;
  /** Override visibility. Default: "public" if `saveTo === 'public'`, else "personal". */
  saveTo?: SaveToOption;
  onImagePasted?: (result: PasteImageUploadResult) => void;
  targetElement?: HTMLElement | null;
  disabled?: boolean;
  children?: React.ReactNode;
  onProcessingChange?: (isProcessing: boolean) => void;
  /** Called when the upload fails. If omitted, a toast shows the error. */
  onError?: (message: string) => void;
};

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
  folderRoot = "userContent",
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

      const folderPath = composeUploadFolderPath(folderRoot, path);
      const visibility: Visibility =
        saveTo === "public"
          ? "public"
          : saveTo === "personal"
            ? "personal"
            : "personal";

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
              shareLinkPermissionLevel: "viewer",
            },
          );
          if (!normalized.url) {
            // `createShareLink: true` is expected to always stitch a
            // browser-safe URL onto the NormalizedFile. A missing URL means
            // that step silently failed — surface it instead of handing
            // callers a fake empty-string URL.
            throw new Error(
              `Pasted image upload completed without a durable URL (fileId: ${normalized.fileId ?? "none"})`,
            );
          }
          const result: PasteImageUploadResult = {
            url: normalized.url,
            type: classifyFileType(file.type),
            fileId: normalized.fileId,
            pageUrl: normalized.shareToken
              ? `/s/${normalized.shareToken}`
              : undefined,
          };
          onImagePasted?.(result);
        } catch (error) {
          const reason =
            error instanceof Error ? error.message : "Upload failed";
          console.error("Error processing pasted image:", error);
          if (onError) onError(reason);
          else toast.error(`Couldn't upload pasted image: ${reason}`);
        } finally {
          updateProcessing(false);
        }
      }
    },
    [
      disabled,
      folderRoot,
      path,
      saveTo,
      upload,
      onImagePasted,
      onError,
      updateProcessing,
    ],
  );

  useEffect(() => {
    const element = targetRef.current;
    if (!element || disabled) return undefined;
    element.addEventListener("paste", handlePaste);
    return () => {
      element.removeEventListener("paste", handlePaste);
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
