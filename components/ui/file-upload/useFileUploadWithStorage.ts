/**
 * useFileUploadWithStorage — LEGACY COMPAT WRAPPER
 *
 * The original hook wrote to Supabase Storage via `FileSystemManager` and a
 * `(bucket, path)` pair. Phase 9 migrated the internals to the new
 * cloud-files system (features/files/*) while preserving the exact public
 * surface so the ~14 feature consumers keep working without edits.
 *
 * How it maps:
 *   - `bucket` → a top-level cloud-files folder name (see mapLegacyBucket).
 *   - `path`   → appended as a subfolder path.
 *   - Upload  → cloud-files `uploadFiles` thunk + `createShareLink` with no
 *     expiry. The returned `url` is the SHARE URL (stable, persistable).
 *   - `metadata` → synthesized from File properties. `localId` → fileId.
 *   - User-assets methods (`uploadToPublicUserAssets`, `uploadToPrivateUserAssets`)
 *     route to dedicated top-level folders.
 *
 * Scheduled for deletion in Phase 11 once callers migrate to
 * `useUploadAndShare` / `useUploadAndGet` from `@/features/files/hooks`.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  getFileDetailsByUrl,
  type EnhancedFileDetails,
} from "@/utils/file-operations/constants";
import type { StorageMetadata } from "@/utils/file-operations/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { cloudUpload, isCloudUploadFailure } from "@/features/files/upload";
import type { Visibility } from "@/features/files/types";

// ---------------------------------------------------------------------------
// Bucket → folder mapping
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
      // Pass through unknown bucket names as folder names.
      return bucket;
  }
}

function composeFolderPath(bucket: string, path?: string): string {
  const top = mapLegacyBucket(bucket).replace(/^\/+|\/+$/g, "");
  const sub = (path ?? "").replace(/^\/+|\/+$/g, "");
  return sub ? `${top}/${sub}` : top;
}

// `user-public-assets` is the only legacy bucket whose name promised
// public-read semantics. Everything else (chat attachments, private user
// assets, generic "userContent", etc.) stays private. Callers that want
// public for an unknown bucket should use `uploadToPublicUserAssets`.
function defaultVisibilityForBucket(bucket: string): Visibility {
  return bucket === "user-public-assets" ? "public" : "private";
}

// ---------------------------------------------------------------------------
// Result shape (matches legacy)
// ---------------------------------------------------------------------------

interface UploadResult {
  /**
   * cld_files UUID. Use this — not `url` — when handing the file to any
   * AI API: the backend resolves a `file_id` directly without following
   * a share-link redirect. See `MediaRef` in
   * [features/files/types.ts](../../features/files/types.ts).
   *
   * Always populated when the upload succeeded. Optional only because
   * older legacy callers may construct UploadResult-shaped objects from
   * non-cloud-files sources.
   */
  fileId?: string;
  /**
   * **Direct, embeddable URL for the file bytes.**
   *
   * Points at Python's `{BACKEND}/share/{token}` resolver, which 302-
   * redirects to a freshly signed S3 URL on every hit. Drop into:
   *   - `<img src>`, `<video src>`, `<audio src>`, `<iframe src>`
   *   - `<a href download>`
   *   - any markdown image / OG-image meta tag / external embed
   *
   * Not the HTML landing page — for that, use `pageUrl`.
   *
   * Prefer `fileId` for AI API payloads (cheaper — no redirect dance).
   */
  url: string;
  /**
   * Optional HTML LANDING PAGE for the share link
   * (`/share/<token>`) — renders metadata + a download button. Use
   * this when you want to give someone a clickable "share with a
   * person" link. Distinct from `url`, which is the binary URL.
   */
  pageUrl?: string;
  type: string;
  details: EnhancedFileDetails;
  metadata?: StorageMetadata;
  /** @deprecated kept for legacy callers — alias of `fileId`. */
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
  // StorageMetadata is a legacy shape. We fill in what we have from the File
  // and leave the rest as empty strings / reasonable defaults — downstream
  // callers read `size` and `mimetype` almost exclusively.
  return {
    eTag: "",
    size: file.size,
    mimetype: file.type || "application/octet-stream",
    cacheControl: "max-age=3600",
    lastModified: new Date(file.lastModified).toISOString(),
    contentLength: file.size,
  } as StorageMetadata;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useFileUploadWithStorage = (bucket: string, path?: string) => {
  const dispatch = useAppDispatch();
  const [results, setResults] = useState<UploadResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `error` is React state — readable AFTER a re-render, which is after
  // the awaited upload promise resolves to the caller. So consumers that
  // do `const r = await uploadFile(f); if (!r) toast.error(error)` see
  // the PREVIOUS error, not the one that just happened. The ref captures
  // the latest synchronously so callers can use `lastErrorRef.current`
  // immediately after the await.
  const lastErrorRef = useRef<string | null>(null);

  // -------------------------------------------------------------------------
  // Core primitive — upload one file to a given folder path, return the
  // legacy-shaped UploadResult with a persistent share URL.
  // -------------------------------------------------------------------------

  const uploadOneTo = useCallback(
    async (
      folderPath: string,
      file: File,
      visibility: Visibility = "private",
    ): Promise<UploadResult | null> => {
      setIsLoading(true);
      setError(null);

      // Single source of truth — `cloudUpload` posts to the Python backend,
      // which auto-creates any missing folders and handles share-link
      // creation in one round-trip. The browser never queries
      // `cld_folders` directly, which sidesteps the well-known RLS
      // recursion bug on `cld_file_permissions`.
      const result = await cloudUpload(
        file,
        {
          folderPath,
          visibility,
          metadata: {
            origin: "legacy-compat:useFileUploadWithStorage",
            legacy_bucket: bucket,
            requested_visibility: visibility,
          },
          createShareLink: true,
        },
        dispatch,
      );

      setIsLoading(false);

      if (isCloudUploadFailure(result)) {
        lastErrorRef.current = result.error;
        setError(result.error);
        // Log so devs can see the full error chain in the console even
        // if the caller swallows the toast.
        // eslint-disable-next-line no-console
        console.error(
          "[useFileUploadWithStorage] upload failed:",
          result.error,
          result.errorCode ? `(code: ${result.errorCode})` : "",
        );
        return null;
      }

      // Prefer the direct-file URL (`/api/share/<token>/file`) for the
      // primary `url` so consumers that drop it into `<img src>` see the
      // image, not a broken icon. The HTML landing page lives on
      // `pageUrl` for callers that want a "click here to view" link.
      //
      // Fall back to `shareUrl` (page) if for some reason the upload
      // didn't produce a direct URL — e.g. a future path that skips
      // share-link creation. Last fallback to the raw signed URL the
      // backend emitted; that one expires in ~1h but at least lets
      // immediate UI render the file before it goes stale.
      const directUrl =
        result.directUrl ?? result.shareUrl ?? result.url ?? "";
      const pageUrl = result.shareUrl;
      const metadata = synthesizeMetadata(file);
      const details = getFileDetailsByUrl(directUrl, metadata, result.fileId);

      const out: UploadResult = {
        // cld_files UUID — first-class field. Callers building outbound
        // AI API payloads should ALWAYS pass this through (as MediaRef.file_id)
        // rather than the share URL. Build a MediaRef via
        // `fileIdToMediaRef` from features/files/redux/converters.ts.
        fileId: result.fileId,
        url: directUrl,
        pageUrl,
        type: classifyFileType(file.type),
        details,
        metadata,
        // Legacy alias — same value, kept for back-compat with any
        // caller that read `localId` directly. New code should use `fileId`.
        localId: result.fileId,
      };
      setResults((prev) => [...prev, out]);
      return out;
    },
    [dispatch, bucket],
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

  // -------------------------------------------------------------------------
  // Public API — mirrors the legacy signatures exactly.
  // -------------------------------------------------------------------------

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

  const getLocalFile = useCallback(async (_localId: string) => {
    // Legacy concept — the new system doesn't maintain a separate local-file
    // store. Callers using this rarely depend on it strictly; return null
    // and let them fall back to the remote URL.
    return null;
  }, []);

  const createUserDirectories = useCallback(async (): Promise<boolean> => {
    // Legacy no-op — the Python backend creates "Shared Assets" /
    // "Private Assets" / any other folder on demand during upload, so
    // pre-creating them is unnecessary. Kept for back-compat: previous
    // callers that pre-flighted directory creation now just see `true`
    // and proceed to upload. No callers in the live tree (verified
    // 2026-04-24).
    return true;
  }, []);

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
     * returns null. Use this for toasts; use the `error` state for
     * persistent UI rendering.
     */
    lastErrorRef,
  };
};
