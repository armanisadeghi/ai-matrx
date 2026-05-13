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

import { getStore } from "@/lib/redux/store-singleton";
import type { AppDispatch } from "@/lib/redux/store";
import * as Api from "@/features/files/api";
import { CloudFolders } from "@/features/files";
import { extractErrorMessage } from "@/utils/errors";
import {
  deleteFile,
  uploadFiles,
  ensureFolderPath,
} from "@/features/files/redux/thunks";
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
  const store = getStore();
  if (!store) throw new Error("Redux store not ready");

  let lastError: Error | null = null;

  // Resolve the hidden staging folder once. `ensureFolderPath` is idempotent
  // — subsequent attempts reuse the existing folder.
  const dispatch = store.dispatch as AppDispatch;
  let parentFolderId: string | null = null;
  try {
    parentFolderId = await dispatch(
      ensureFolderPath({
        folderPath: CloudFolders.TMP_TRANSCRIPTS,
        visibility: "private",
      }),
    ).unwrap();
  } catch {
    // If folder creation fails (RLS, transient network), fall back to root.
    parentFolderId = null;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const fileName = generateFileName();
      const file = new File([blob], fileName, {
        type: blob.type || "audio/webm",
      });

      const { uploaded, failed } = await dispatch(
        uploadFiles({
          files: [file],
          parentFolderId,
          visibility: "private",
          metadata: {
            origin: "audio-fallback",
            blob_type: blob.type || "audio/webm",
            ephemeral: true,
          },
          concurrency: 1,
        }),
      ).unwrap();

      if (failed.length > 0 || uploaded.length === 0) {
        // `failed` items are `{ name, error }` since 2026-04-24 — extract
        // the real backend error rather than the whole object.
        throw new Error(failed[0]?.error ?? "Upload failed");
      }
      const fileId = uploaded[0];

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
        const cleanupStore = getStore();
        if (cleanupStore) {
          await (cleanupStore.dispatch as AppDispatch)(deleteFile({ fileId: handle.fileId, hardDelete: true })).unwrap();
        }
      } catch {
        // Non-critical cleanup — the file will be auto-pruned by the
        // backend's retention policy if the hard-delete fails.
      }
    }
  }
}
