/**
 * features/files/handler/hooks/useFileUpload.ts
 *
 * The single React-side upload primitive.
 *
 *   upload(source, opts)         — one file. Returns NormalizedFile.
 *   uploadMany(files, opts)      — many files, with the duplicate-detection
 *                                  pre-flight dialog. Returns
 *                                  { uploaded, failed, cancelled }.
 *
 * Single-file uploads route through cloudUpload (Python POST +
 * optimistic Redux dispatch + optional share-link creation). Multi-file
 * uploads route through `requestUpload` from `<UploadGuardHost/>` so the
 * SHA-256 dedup pre-flight + DuplicateUploadDialog UX is consistent for
 * every multi-file drop.
 *
 * Anonymous users (visitors on `/p/[slug]`) work via the standard cloud-
 * files JWT path because Supabase issues an anonymous auth UUID for
 * them. The handler does not branch on anonymous vs authenticated.
 */

"use client";

import { useCallback, useState } from "react";
import { fileHandler } from "../handler";
import { requestUpload } from "@/features/files/upload/UploadGuardHost";
import type { UploadFilesArg } from "@/features/files/types";
import type { FileSource, NormalizedFile, UploadOpts } from "../types";

export interface UploadProgress {
  loaded: number;
  total: number;
  ratio: number;
}

export interface MultiUploadOptions
  extends Omit<UploadFilesArg, "files" | "parentFolderId" | "visibility"> {
  /** Parent cloud-files folder id. null = root. */
  parentFolderId?: string | null;
  /** Default visibility for every file in the batch. */
  visibility?: UploadFilesArg["visibility"];
}

export interface MultiUploadResult {
  /** cld_files UUIDs for every successful upload. */
  uploaded: string[];
  /** Per-file failure with the real backend error message. */
  failed: Array<{ name: string; error: string }>;
  /** True when the user dismissed the duplicate-upload dialog. */
  cancelled: boolean;
  /**
   * Files the user chose to attach as the EXISTING copy (via "Use
   * existing" in the duplicate dialog) instead of re-uploading. Each
   * entry carries the index into the original `files` argument plus
   * the live `cld_files.id` the caller should wire into its parent
   * context (chat attachment, agent resource, etc.). Follows the
   * `duplicate_of_file_id` chain so dup ids resolve to live keepers.
   *
   * Empty for the normal no-conflict path. See
   * `features/files/upload/uploadGuardOpeners.ts` for the underlying
   * shape.
   */
  aliased: Array<{ inputIndex: number; existingFileId: string }>;
}

export interface UseFileUploadResult {
  /** Upload one file (or any FileSource — paste, blob, base64, url). */
  upload: (source: FileSource, opts?: UploadOpts) => Promise<NormalizedFile>;
  /**
   * Upload many files at once. Runs the SHA-256 dedup pre-flight and shows
   * the duplicate-resolution dialog when conflicts are found. Returns
   * per-file success/failure so callers can render their own progress UI.
   */
  uploadMany: (files: File[], opts?: MultiUploadOptions) => Promise<MultiUploadResult>;
  uploading: boolean;
  progress: UploadProgress | null;
  result: NormalizedFile | null;
  error: Error | null;
  reset: () => void;
}

export function useFileUpload(): UseFileUploadResult {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<NormalizedFile | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const upload = useCallback(
    async (source: FileSource, opts: UploadOpts = {}): Promise<NormalizedFile> => {
      setUploading(true);
      setError(null);
      setProgress(null);
      try {
        const normalized = await fileHandler.upload(source, {
          ...opts,
          onProgress: (loaded, total) => {
            setProgress({
              loaded,
              total,
              ratio: total > 0 ? loaded / total : 0,
            });
            opts.onProgress?.(loaded, total);
          },
        });
        setResult(normalized);
        return normalized;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  const uploadMany = useCallback(
    async (
      files: File[],
      opts: MultiUploadOptions = {},
    ): Promise<MultiUploadResult> => {
      const arg: UploadFilesArg = {
        files,
        parentFolderId: opts.parentFolderId ?? null,
        visibility: opts.visibility ?? "private",
        shareWith: opts.shareWith,
        shareLevel: opts.shareLevel,
        changeSummary: opts.changeSummary,
        metadata: opts.metadata,
        options: opts.options,
        concurrency: opts.concurrency,
      };
      return requestUpload(arg);
    },
    [],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(null);
  }, []);

  return { upload, uploadMany, uploading, progress, result, error, reset };
}
