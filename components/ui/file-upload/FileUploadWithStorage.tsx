import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  MultiFileUpload,
  MiniFileUpload,
} from "@/components/ui/file-upload/file-upload";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { motion, type Variants } from "motion/react";
import {
  getFileDetailsByUrl,
  type EnhancedFileDetails,
} from "@/utils/file-operations/constants";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import type { Visibility } from "@/features/files/types";
import type { NormalizedFile } from "@/features/files/handler/types";
import type { StorageMetadata } from "@/utils/file-operations/types";
import { UploadedFileResult } from "./types";

export type { UploadedFileResult } from "./types";

type SaveToOption = "public" | "private";

type FileUploadWithStorageProps = {
  bucket?: string;
  path?: string;
  saveTo?: SaveToOption;
  onUploadComplete?: (results: UploadedFileResult[]) => void;
  onUploadStatusChange?: (isUploading: boolean) => void;
  multiple?: boolean;
  useMiniUploader?: boolean;
  maxHeight?: string;
  initialFiles?: UploadedFileResult[]; // Add initialFiles prop
};

// Legacy bucket-name → cloud-files folder path mapping. Used to keep the
// `bucket` / `path` / `saveTo` props working for the dozen-plus consumers
// of this component while the underlying upload goes through the universal
// handler. Mirrors what the deleted useFileUploadWithStorage shim used to do.
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

function composeFolderPath(bucket: string, path?: string): string {
  const top = mapLegacyBucket(bucket).replace(/^\/+|\/+$/g, "");
  const sub = (path ?? "").replace(/^\/+|\/+$/g, "");
  return sub ? `${top}/${sub}` : top;
}

function classifyFileType(mimeType: string): string {
  if (!mimeType) return "unknown";
  const type = mimeType.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("text/") || type === "application/json") return "text";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf") return "pdf";
  return "other";
}

function synthesizeMetadata(file: File): StorageMetadata {
  return {
    eTag: "",
    size: file.size,
    mimetype: file.type || "application/octet-stream",
    cacheControl: "max-age=3600",
    lastModified: new Date(file.lastModified).toISOString(),
    contentLength: file.size,
  } as StorageMetadata;
}

function normalizedToLegacyResult(
  normalized: NormalizedFile,
  file: File,
): UploadedFileResult {
  const url = normalized.url ?? "";
  const metadata = synthesizeMetadata(file);
  const details: EnhancedFileDetails = getFileDetailsByUrl(
    url,
    metadata,
    normalized.fileId,
  );
  return {
    fileId: normalized.fileId,
    url,
    type: classifyFileType(file.type),
    details,
  };
}

export const FileUploadWithStorage: React.FC<FileUploadWithStorageProps> = ({
  bucket = "userContent",
  path,
  saveTo,
  onUploadComplete,
  onUploadStatusChange,
  multiple = false,
  useMiniUploader = false,
  maxHeight,
  initialFiles = [], // Add default empty array
}) => {
  const { upload, uploading: isLoading } = useFileUpload();
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const lastErrorRef = useRef<string | null>(null);

  const folderPath = useMemo(() => {
    if (saveTo === "public") return "Shared Assets";
    if (saveTo === "private") return "Private Assets";
    return composeFolderPath(bucket, path);
  }, [saveTo, bucket, path]);

  const visibility: Visibility = useMemo(() => {
    if (saveTo) return saveTo;
    return bucket === "user-public-assets" ? "public" : "private";
  }, [saveTo, bucket]);

  useEffect(() => {
    if (onUploadStatusChange) {
      const isActivelyUploading = isLoading && uploadingFiles.length > 0;
      onUploadStatusChange(isActivelyUploading);
    }
  }, [isLoading, uploadingFiles.length, onUploadStatusChange]);

  const handleFilesChange = useCallback(
    async (files: File[]) => {
      setUploadingFiles(files);
      lastErrorRef.current = null;

      const results: UploadedFileResult[] = [];
      try {
        // The universal handler is single-file; loop for the multi-file UX
        // this component exposes. Each call returns a NormalizedFile with
        // the share-link-backed URL stitched on so the result shape stays
        // identical to what existing consumers expect.
        for (const file of files) {
          try {
            const normalized = await upload(
              { kind: "file", file },
              {
                folderPath,
                visibility,
                createShareLink: true,
                shareLinkPermissionLevel: "read",
                metadata: {
                  origin: "FileUploadWithStorage",
                  legacy_bucket: bucket,
                  requested_visibility: visibility,
                },
              },
            );
            results.push(normalizedToLegacyResult(normalized, file));
          } catch (err) {
            const message = err instanceof Error ? err.message : "Upload failed";
            lastErrorRef.current = message;
            // eslint-disable-next-line no-console
            console.error("FileUploadWithStorage upload failed:", message);
          }
        }

        if (results.length > 0 && onUploadComplete) {
          onUploadComplete(results);
        } else if (results.length === 0 && files.length > 0) {
          const reason = lastErrorRef.current ?? "Upload failed";
          toast.error(`Upload failed: ${reason}`);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Upload failed";
        // eslint-disable-next-line no-console
        console.error("Error in handleFilesChange:", error);
        toast.error(`Upload failed: ${reason}`);
      } finally {
        setUploadingFiles([]);
      }
    },
    [upload, folderPath, visibility, bucket, onUploadComplete],
  );

  // Progress animation variants
  const progressVariants: Variants = {
    progress: {
      width: ["3%", "29%", "60%", "75%", "85%", "92%"],
      transition: {
        times: [0, 0.2, 0.3, 0.4, 0.7, 1],
        duration: 8,
        ease: "easeOut",
        repeat: 0,
      },
    },
  };

  const isActivelyUploading = isLoading && uploadingFiles.length > 0;

  // Determine whether to use mini or regular progress indicator
  const ProgressIndicator = () => (
    <div className={`mt-${useMiniUploader ? "3" : "6"}`}>
      <div className="mb-2 flex items-center gap-2">
        <svg
          className="animate-spin h-4 w-4 text-blue-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <h3
          className={`${useMiniUploader ? "text-xs" : "text-sm"} font-medium`}
        >
          Uploading {uploadingFiles.length}{" "}
          {uploadingFiles.length === 1 ? "file" : "files"}
        </h3>
      </div>

      <div
        className={`bg-white dark:bg-neutral-800 rounded-lg shadow-sm ${useMiniUploader ? "p-2" : "p-4"}`}
      >
        <div className="w-full h-3 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
          {(() => {
            try {
              return (
                <motion.div
                  className="h-full bg-blue-500"
                  initial={{ width: "0%" }}
                  animate="progress"
                  variants={progressVariants}
                />
              );
            } catch (error) {
              console.error("🔧 Error rendering motion.div:", error);
              return <div className="h-full bg-blue-500 w-1/2"></div>;
            }
          })()}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {/* Conditionally render either the normal or mini uploader */}
      {useMiniUploader ? (
        <MiniFileUpload
          onChange={handleFilesChange}
          multiple={multiple}
          maxHeight={maxHeight}
          initialFiles={initialFiles}
        />
      ) : (
        <MultiFileUpload
          onChange={handleFilesChange}
          multiple={multiple}
          maxHeight={maxHeight}
          initialFiles={initialFiles}
        />
      )}

      {/* Progress indicator */}
      {isActivelyUploading && <ProgressIndicator />}
    </div>
  );
};

export default FileUploadWithStorage;
