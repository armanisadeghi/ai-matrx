/**
 * features/file-handler/hooks/useFileUpload.ts
 *
 * The single React-side upload primitive. Goes through `cloudUpload`
 * (the underlying Python POST + optimistic Redux dispatch + optional
 * share-link creation) — there is no other upload path.
 *
 * Anonymous users (visitors on `/p/[slug]`) work via the standard cloud-
 * files JWT path because Supabase issues an anonymous auth UUID for
 * them. The handler does not branch on anonymous vs authenticated.
 */

"use client";

import { useCallback, useState } from "react";
import { fileHandler } from "../handler";
import type { FileSource, NormalizedFile, UploadOpts } from "../types";

export interface UploadProgress {
  loaded: number;
  total: number;
  ratio: number;
}

export interface UseFileUploadResult {
  upload: (source: FileSource, opts?: UploadOpts) => Promise<NormalizedFile>;
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

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(null);
  }, []);

  return { upload, uploading, progress, result, error, reset };
}
