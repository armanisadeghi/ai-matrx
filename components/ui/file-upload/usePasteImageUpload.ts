import { useEffect, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { fileHandler } from "@/features/file-handler/handler";
import type { Visibility } from "@/features/files/types";
import { CloudFolders } from "@/features/files/utils/folder-conventions";

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

type PasteImageUploadProps = {
  /** Legacy bucket name; mapped to a top-level cld_files folder. */
  bucket?: string;
  /** Sub-folder under the bucket-mapped top-level folder. */
  path?: string;
  /** Override visibility. Default: "public" if `saveTo === 'public'`, else "private". */
  saveTo?: SaveToOption;
  targetRef: React.RefObject<HTMLElement>;
  onImagePasted?: (result: PasteImageUploadResult) => void;
  /**
   * Called when the upload fails. If omitted, a toast shows the real
   * backend error.
   */
  onError?: (message: string) => void;
  disabled?: boolean;
  onProcessingChange?: (isProcessing: boolean, processRef?: any) => void;
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

export const usePasteImageUpload = ({
  bucket = "userContent",
  path,
  saveTo,
  targetRef,
  onImagePasted,
  onError,
  disabled = false,
  onProcessingChange,
}: PasteImageUploadProps) => {
  const isProcessingRef = useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const createProcessRef = useCallback(() => {
    abortControllerRef.current = new AbortController();
    return {
      cancel: () => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
          updateProcessingState(false);
        }
      },
      signal: abortControllerRef.current.signal,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateProcessingState = useCallback(
    (processing: boolean, processRef?: any) => {
      isProcessingRef.current = processing;
      setIsProcessing(processing);
      if (onProcessingChange) {
        onProcessingChange(processing, processRef);
      }
    },
    [onProcessingChange],
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      if (disabled || isProcessingRef.current) return;

      const items = event.clipboardData?.items;
      if (!items) return;

      // Resolve folder + visibility per legacy bucket/path/saveTo semantics.
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
        const processRef = createProcessRef();
        updateProcessingState(true, processRef);

        try {
          const file = item.getAsFile();
          if (!file) continue;
          const timestamp = new Date().getTime();
          const fileName = `pasted_image_${timestamp}.png`;
          const namedFile = new File([file], fileName, { type: file.type });

          const checkCancellation = setInterval(() => {
            if (abortControllerRef.current?.signal.aborted) {
              clearInterval(checkCancellation);
              throw new DOMException("Aborted", "AbortError");
            }
          }, 100);

          const normalized = await fileHandler.upload(
            { kind: "file", file: namedFile },
            {
              folderPath,
              visibility,
              createShareLink: true,
              shareLinkPermissionLevel: "read",
            },
          );

          clearInterval(checkCancellation);

          if (!abortControllerRef.current?.signal.aborted) {
            const result: PasteImageUploadResult = {
              url: normalized.url ?? "",
              type: classifyFileType(file.type),
              fileId: normalized.fileId,
              pageUrl: normalized.shareToken
                ? `/share/${normalized.shareToken}`
                : undefined,
            };
            if (onImagePasted) onImagePasted(result);
          }
        } catch (error) {
          if ((error as any).name === "AbortError") {
            // eslint-disable-next-line no-console
            console.log("Image upload was cancelled");
          } else {
            const reason =
              error instanceof Error ? error.message : "Upload failed";
            // eslint-disable-next-line no-console
            console.error("Error processing pasted image:", error);
            if (onError) {
              onError(reason);
            } else {
              toast.error(`Couldn't upload pasted image: ${reason}`);
            }
          }
        } finally {
          if (!abortControllerRef.current?.signal.aborted) {
            abortControllerRef.current = null;
            updateProcessingState(false);
          }
        }
      }
    },
    [
      disabled,
      bucket,
      path,
      saveTo,
      onImagePasted,
      onError,
      updateProcessingState,
      createProcessRef,
    ],
  );

  useEffect(() => {
    const element = targetRef.current;
    if (!element || disabled) return;

    element.addEventListener("paste", handlePaste as EventListener);

    return () => {
      element.removeEventListener("paste", handlePaste as EventListener);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [targetRef, handlePaste, disabled]);

  return {
    isListening: !disabled,
    isProcessing,
  };
};

export default usePasteImageUpload;
