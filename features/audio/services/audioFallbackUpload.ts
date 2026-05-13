/**
 * Audio Fallback Upload Service
 *
 * When chunked transcription fails, uploads the full audio blob via the new
 * cloud-files backend, obtains a short-lived signed URL, hands it to the
 * URL-based transcription API (Groq Developer Plan supports up to 100 MB via
 * URL), and then hard-deletes the temporary upload.
 *
 * Migrated from direct `supabase.storage` usage to the new cloud-files
 * system in Phase 8.
 *
 * Folder convention (from features/files/utils/folder-conventions.ts):
 *   - Staging files live under `.matrx-tmp/transcripts/` — hidden from the
 *     user's tree. They're hard-deleted on success AND on failure, so the
 *     folder should stay empty in the normal case. If a process crashes
 *     between upload and delete, a janitor / user can trivially clean up.
 */

"use client";

import * as Api from "@/features/files/api";
import { CloudFolders, fileHandler } from "@/features/files";
import { extractErrorMessage } from "@/utils/errors";
import { AUDIO_API_ROUTES, RETRY_CONFIG } from "../constants";
import { TranscriptionResult, TranscriptionOptions } from "../types";

function generateFileName(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).substring(2, 8);
  return `${ts}_${rand}.webm`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface UploadHandle {
  fileId: string;
  signedUrl: string;
}

async function uploadWithRetry(
  blob: Blob,
  maxAttempts: number = RETRY_CONFIG.MAX_ATTEMPTS,
): Promise<UploadHandle> {
  let lastError: Error | null = null;

  // Pre-resolve the hidden staging folder so the first upload doesn't race
  // with folder creation. `ensureFolderPath` is idempotent — subsequent
  // calls reuse the existing folder. We don't use the returned id directly
  // since `fileHandler.upload` takes a path; this just primes the cache.
  let folderPath: string | null = null;
  try {
    await fileHandler.ensureFolderPath({
      folderPath: CloudFolders.TMP_TRANSCRIPTS,
      visibility: "private",
    });
    folderPath = CloudFolders.TMP_TRANSCRIPTS;
  } catch {
    // If folder creation fails (RLS, transient network), fall back to root.
    folderPath = null;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const fileName = generateFileName();
      const file = new File([blob], fileName, {
        type: blob.type || "audio/webm",
      });

      const normalized = await fileHandler.upload(
        { kind: "file", file },
        {
          folderPath: folderPath ?? undefined,
          visibility: "private",
          metadata: {
            origin: "audio-fallback",
            blob_type: blob.type || "audio/webm",
            ephemeral: true,
          },
        },
      );
      if (!normalized.fileId) {
        throw new Error("Upload returned no fileId");
      }
      const fileId = normalized.fileId;

      // Short-lived signed URL for the transcription service (10 min).
      const { data: url } = await Api.Files.getSignedUrl(fileId, {
        expiresIn: 600,
      });

      return { fileId, signedUrl: url.url };
    } catch (err) {
      lastError =
        err instanceof Error ? err : new Error(extractErrorMessage(err));
      if (attempt < maxAttempts) {
        const delay = Math.min(
          RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt - 1),
          RETRY_CONFIG.MAX_DELAY_MS,
        );
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error("Upload failed after retries");
}

export async function logClientError(entry: {
  errorCode: string;
  errorMessage: string;
  fileSizeBytes?: number;
  chunkIndex?: number;
  apiRoute?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await fetch(AUDIO_API_ROUTES.LOG_ERROR, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  } catch {
    console.error("[logClientError] Failed to report error to server");
  }
}

export async function uploadAndTranscribeFull(
  blob: Blob,
  _userId: string,
  options?: TranscriptionOptions,
): Promise<TranscriptionResult> {
  let handle: UploadHandle | null = null;

  try {
    handle = await uploadWithRetry(blob);

    const body: Record<string, string> = { url: handle.signedUrl };
    if (options?.language) body.language = options.language;
    if (options?.prompt) body.prompt = options.prompt;

    const response = await fetch(AUDIO_API_ROUTES.TRANSCRIBE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      const errorMsg = data.error || "URL transcription failed";
      await logClientError({
        errorCode: `HTTP_${response.status}`,
        errorMessage: errorMsg,
        fileSizeBytes: blob.size,
        apiRoute: AUDIO_API_ROUTES.TRANSCRIBE_URL,
      });
      return { success: false, text: "", error: errorMsg };
    }

    return {
      success: true,
      text: data.text,
      language: data.language,
      duration: data.duration,
      segments: data.segments,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Fallback transcription failed";
    await logClientError({
      errorCode: "FALLBACK_FAILED",
      errorMessage: message,
      fileSizeBytes: blob.size,
      apiRoute: "fallback-upload",
    });
    return { success: false, text: "", error: message };
  } finally {
    if (handle) {
      try {
        // Cleanup the staging file. Raw API call — this is a non-React
        // service path and the slice's deleteFile thunk isn't part of
        // the public surface. The realtime channel will reconcile the
        // slice state asynchronously.
        await Api.Files.deleteFile(handle.fileId, { hardDelete: true });
      } catch {
        // Non-critical cleanup — the file will be auto-pruned by the
        // backend's retention policy if the hard-delete fails.
      }
    }
  }
}
