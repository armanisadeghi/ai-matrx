/**
 * useFileUploadWithStorage — LEGACY COMPAT SHIM over the universal handler
 *
 * Thin shim around `fileHandler.upload(...)` that preserves the old
 * `(bucket, path)` API + `UploadResult` shape so the existing dropzone
 * component (`FileUploadWithStorage`) and the dozen-or-so consumers
 * that call this hook directly keep working without edits.
 *
 * Under the hood there is ONE upload code path: this shim →
 * `fileHandler.upload` → `cloudUpload` → Python `/files/upload`.
 *
 * @deprecated For NEW code, use `useFileUpload` from
 *   `@/features/file-handler/hooks/useFileUpload` directly. Returns a
 *   `NormalizedFile` with `fileId`, `url`, `shareToken`, `meta`, and
 *   richer error typing. This shim exists only so we don't churn 24
 *   working files on a cosmetic rename.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  getFileDetailsByUrl,
  type EnhancedFileDetails,
} from "@/utils/file-operations/constants";
import type { StorageMetadata } from "@/utils/file-operations/types";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { fileHandler } from "@/features/file-handler/handler";
import type { NormalizedFile } from "@/features/file-handler/types";
import type { Visibility } from "@/features/files/types";

// ---------------------------------------------------------------------------
// Bucket → folder mapping (legacy "bucket" prop maps to a top-level folder)
// ---------------------------------------------------------------------------

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

function defaultVisibilityForBucket(bucket: string): Visibility {
  return bucket === "user-public-assets" ? "public" : "private";
}

// ---------------------------------------------------------------------------
// Result shape (matches legacy)
// ---------------------------------------------------------------------------

interface UploadResult {
  fileId?: string;
  /** Embeddable direct URL — Python's `/share/{token}` resolver. */
  url: string;
  /** Optional HTML landing page (`/share/<token>`). */
  pageUrl?: string;
  type: string;
  details: EnhancedFileDetails;
  metadata?: StorageMetadata;
  /** @deprecated alias of `fileId`. */
  localId?: string;
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
): UploadResult {
  const url = normalized.url ?? "";
  const pageUrl = normalized.shareToken
    ? `/share/${normalized.shareToken}`
    : undefined;
  const metadata = synthesizeMetadata(file);
  const details = getFileDetailsByUrl(url, metadata, normalized.fileId);
  return {
    fileId: normalized.fileId,
    url,
    pageUrl,
    type: classifyFileType(file.type),
    details,
    metadata,
    localId: normalized.fileId,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useFileUploadWithStorage = (bucket: string, path?: string) => {
  const [results, setResults] = useState<UploadResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `error` is React state (next-render visible). The ref captures the
  // synchronous failure so callers can do `await uploadFile(f); if (!r)
  // toast.error(lastErrorRef.current)` immediately.
  const lastErrorRef = useRef<string | null>(null);

  const uploadOneTo = useCallback(
    async (
      folderPath: string,
      file: File,
      visibility: Visibility = "private",
    ): Promise<UploadResult | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const normalized = await fileHandler.upload(
          { kind: "file", file },
          {
            folderPath,
            visibility,
            createShareLink: true,
            shareLinkPermissionLevel: "read",
            metadata: {
              origin: "legacy-compat:useFileUploadWithStorage",
              legacy_bucket: bucket,
              requested_visibility: visibility,
            },
          },
        );
        const out = normalizedToLegacyResult(normalized, file);
        setResults((prev) => [...prev, out]);
        return out;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Upload failed";
        lastErrorRef.current = message;
        setError(message);
        // eslint-disable-next-line no-console
        console.error("[useFileUploadWithStorage] upload failed:", message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [bucket],
  );

  const uploadMultipleTo = useCallback(
    async (
      folderPath: string,
      files: File[],
      visibility: Visibility = "private",
    ): Promise<UploadResult[]> => {
      const out: UploadResult[] = [];
      for (const file of files) {
        const r = await uploadOneTo(folderPath, file, visibility);
        if (r) out.push(r);
      }
      return out;
    },
    [uploadOneTo],
  );

  const defaultFolder = useMemo(
    () => composeFolderPath(bucket, path),
    [bucket, path],
  );
  const defaultVisibility = useMemo(
    () => defaultVisibilityForBucket(bucket),
    [bucket],
  );

  const uploadFile = useCallback(
    (file: File) => uploadOneTo(defaultFolder, file, defaultVisibility),
    [uploadOneTo, defaultFolder, defaultVisibility],
  );

  const uploadFiles = useCallback(
    async (files: File[]): Promise<UploadResult[]> => {
      const res = await uploadMultipleTo(defaultFolder, files, defaultVisibility);
      setResults(res);
      return res;
    },
    [uploadMultipleTo, defaultFolder, defaultVisibility],
  );

  const getLocalFile = useCallback(async (_localId: string) => null, []);
  const createUserDirectories = useCallback(async (): Promise<boolean> => true, []);

  const uploadToPublicUserAssets = useCallback(
    (file: File) => uploadOneTo("Shared Assets", file, "public"),
    [uploadOneTo],
  );
  const uploadMultipleToPublicUserAssets = useCallback(
    async (files: File[]) => {
      const res = await uploadMultipleTo("Shared Assets", files, "public");
      setResults(res);
      return res;
    },
    [uploadMultipleTo],
  );
  const uploadToPrivateUserAssets = useCallback(
    (file: File) => uploadOneTo("Private Assets", file, "private"),
    [uploadOneTo],
  );
  const uploadMultipleToPrivateUserAssets = useCallback(
    async (files: File[]) => {
      const res = await uploadMultipleTo("Private Assets", files, "private");
      setResults(res);
      return res;
    },
    [uploadMultipleTo],
  );

  return {
    uploadFile,
    uploadFiles,
    getLocalFile,
    createUserDirectories,
    uploadToPublicUserAssets,
    uploadMultipleToPublicUserAssets,
    uploadToPrivateUserAssets,
    uploadMultipleToPrivateUserAssets,
    results,
    isLoading,
    error,
    /**
     * Latest error message — updated synchronously inside the failure
     * branch so callers can read it immediately after `await uploadXxx()`
     * returns null.
     */
    lastErrorRef,
  };
};
