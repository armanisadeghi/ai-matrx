/**
 * features/files/components/core/FileUploadDropzone/FileUploadDropzone.tsx
 *
 * Drag + paste + picker uploader. Wraps `react-dropzone` for drag and
 * `useFileUpload` for the actual work. Can render as:
 *   (a) a full-panel overlay that intercepts the whole surface (mode="overlay")
 *   (b) an inline block with visible affordance (mode="inline")
 *
 * Progress is read from the `cloudFiles.uploads` slice via selectors, so
 * callers get live progress automatically.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveUploads } from "@/features/files/redux/selectors";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { UploadProgressList } from "./UploadProgressList";
import type { UploadFilesArg } from "@/features/files/types";
import { extractErrorMessage } from "@/utils/errors";

export interface FileUploadDropzoneProps {
  /** Parent folder for uploads. null = root. */
  parentFolderId: string | null;
  /** Default visibility for uploads from this dropzone. */
  visibility?: UploadFilesArg["visibility"];
  /** Restrict accepted mime types (e.g., ["image/*"]). */
  accept?: string[];
  /** Max size per file in bytes (UI-only; server enforces its own cap). */
  maxSize?: number;
  /** Enable paste from clipboard (images only). Defaults true. */
  enablePaste?: boolean;
  /** Rendering mode. */
  mode?: "overlay" | "inline";
  /** Children render inside the drop surface. */
  children?: React.ReactNode;
  className?: string;
  onUploaded?: (fileIds: string[]) => void;
  onError?: (message: string) => void;
  /** Optional window event name that opens the native file picker. */
  pickerEventName?: string;
}

export function FileUploadDropzone({
  parentFolderId,
  visibility = "private",
  accept,
  maxSize,
  enablePaste = true,
  mode = "overlay",
  children,
  className,
  onUploaded,
  onError,
  pickerEventName,
}: FileUploadDropzoneProps) {
  const { uploadMany: upload } = useFileUpload();
  const activeUploads = useAppSelector(selectActiveUploads);
  const [pasteHighlight, setPasteHighlight] = useState(false);

  const handleUpload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      try {
        const { uploaded, failed } = await upload(files, {
          parentFolderId,
          visibility,
        });
        if (uploaded.length && onUploaded) onUploaded(uploaded);
        if (failed.length && onError) {
          // `failed` is `{ name, error }[]` — surface BOTH the file and the
          // real backend reason. Joining objects rendered "[object Object]"
          // to the user, hiding every actual failure cause (CORS, 413, 401…).
          const message = failed
            .map((f) => `${f.name}: ${f.error}`)
            .join("; ");
          onError(message);
        }
      } catch (err) {
        const message = extractErrorMessage(err);
        onError?.(message);
      }
    },
    [upload, parentFolderId, visibility, onUploaded, onError],
  );

  const acceptMap = useMemo<Record<string, string[]> | undefined>(() => {
    if (!accept || !accept.length) return undefined;
    // react-dropzone 14 shape: { "image/*": [] }
    return accept.reduce<Record<string, string[]>>((map, pattern) => {
      map[pattern] = [];
      return map;
    }, {});
  }, [accept]);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open: openPicker,
  } = useDropzone({
    onDrop: (acceptedFiles) => void handleUpload(acceptedFiles),
    noClick: true,
    noKeyboard: true,
    accept: acceptMap,
    maxSize,
  });

  useEffect(() => {
    if (!pickerEventName || typeof window === "undefined") return;
    const handler = () => openPicker();
    window.addEventListener(pickerEventName, handler);
    return () => window.removeEventListener(pickerEventName, handler);
  }, [openPicker, pickerEventName]);

  // Clipboard paste — images only.
  useEffect(() => {
    if (!enablePaste || typeof window === "undefined") return;
    const handler = (event: ClipboardEvent) => {
      if (!event.clipboardData?.items) return;
      const images: File[] = [];
      for (const item of Array.from(event.clipboardData.items)) {
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (!blob) continue;
          const ext = blob.type.split("/")[1] ?? "png";
          const name = `pasted-${Date.now()}.${ext}`;
          images.push(new File([blob], name, { type: blob.type }));
        }
      }
      if (images.length > 0) {
        event.preventDefault();
        setPasteHighlight(true);
        setTimeout(() => setPasteHighlight(false), 400);
        void handleUpload(images);
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [enablePaste, handleUpload]);

  const rootProps = getRootProps();
  const highlighted = isDragActive || pasteHighlight;

  if (mode === "inline") {
    return (
      <div
        {...rootProps}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-6",
          "text-sm text-muted-foreground",
          highlighted ? "border-primary bg-primary/5" : "border-border",
          className,
        )}
      >
        <input {...getInputProps()} />
        <Upload className="h-8 w-8" aria-hidden="true" />
        <div className="text-center">
          <p>
            Drag & drop files here, or{" "}
            <button
              type="button"
              onClick={openPicker}
              className="underline font-medium text-foreground"
            >
              browse
            </button>
          </p>
          {enablePaste ? (
            <p className="text-xs mt-1 opacity-75">
              You can also paste an image with ⌘V.
            </p>
          ) : null}
        </div>
        {activeUploads.length > 0 ? (
          <UploadProgressList uploads={activeUploads} />
        ) : null}
      </div>
    );
  }

  return (
    <div
      {...rootProps}
      className={cn("relative h-full w-full", className)}
      data-drop-active={highlighted ? "true" : undefined}
    >
      <input {...getInputProps()} />
      {children}
      {highlighted ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/10"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="h-10 w-10" aria-hidden="true" />
            <span className="font-medium">Drop to upload</span>
          </div>
        </div>
      ) : null}
      {activeUploads.length > 0 ? (
        <div className="absolute bottom-3 right-3 z-20 w-80 max-w-[90%]">
          <UploadProgressList uploads={activeUploads} />
        </div>
      ) : null}
    </div>
  );
}
