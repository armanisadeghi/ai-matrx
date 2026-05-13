// features/transcripts/service/audioStorageService.ts
//
// Audio storage for the transcripts feature. Goes through the universal
// file handler — every audio recording becomes a `cld_files` row, with
// the same RLS, signed-URL refresh, and lifecycle as any other file in
// the app. Single system, no Supabase Storage buckets.

import { fileHandler } from "@/features/files/handler/handler";
import * as Files from "@/features/files/api/files";
import { RECORDING_LIMITS } from "../constants/recording";

interface UploadResult {
  /** cld_files UUID — replaces the legacy storage path. */
  fileId: string;
  /** Logical path on the cloud-files tree. */
  filePath: string;
  filename: string;
  size: number;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  size: number;
}

export function validateAudioFile(
  blob: Blob,
  maxSize: number = RECORDING_LIMITS.MAX_FILE_SIZE_BYTES,
): ValidationResult {
  const size = blob.size;
  if (size === 0 || !blob) {
    return {
      valid: false,
      error: "Audio file is empty. Please ensure you recorded audio before stopping.",
      size: 0,
    };
  }
  if (size < 100) {
    return {
      valid: false,
      error: "Audio file is too small. Please record for at least 1 second.",
      size,
    };
  }
  if (size > maxSize) {
    return {
      valid: false,
      error: `File size (${formatFileSize(size)}) exceeds maximum allowed size (${formatFileSize(maxSize)})`,
      size,
    };
  }
  return { valid: true, size };
}

export function generateAudioFilename(prefix: string = "recording"): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const randomId = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${randomId}.webm`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Upload an audio recording to cloud-files. Retries indefinitely (up to
 * `maxRetries`) so a flaky network never loses a recording.
 */
export async function saveAudioToStorage(
  audioBlob: Blob,
  userId: string,
  onProgress?: (percent: number, status: string) => void,
  maxRetries: number = 5,
): Promise<UploadResult> {
  const validation = validateAudioFile(audioBlob);
  if (!validation.valid) throw new Error(validation.error);

  const filename = generateAudioFilename("recording");
  const file = new File([audioBlob], filename, { type: "audio/webm" });

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      attempt++;
      onProgress?.(0, `Uploading audio (attempt ${attempt}/${maxRetries})...`);

      const normalized = await fileHandler.upload(
        { kind: "file", file },
        {
          folderPath: "Transcripts/Recordings",
          visibility: "private",
          metadata: { origin: "transcripts", recorded_by: userId },
        },
      );

      onProgress?.(100, "Upload complete!");

      if (!normalized.fileId) {
        throw new Error("Upload succeeded but no fileId returned");
      }

      return {
        fileId: normalized.fileId,
        filePath: `Transcripts/Recordings/${filename}`,
        filename,
        size: audioBlob.size,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // eslint-disable-next-line no-console
      console.error(`Upload attempt ${attempt} failed:`, error);
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 16000);
        onProgress?.(
          (attempt / maxRetries) * 50,
          `Upload failed. Retrying in ${delay / 1000}s...`,
        );
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `Failed to upload audio after ${maxRetries} attempts. Last error: ${lastError?.message ?? "Unknown error"}. Your audio is safe and has not been lost.`,
  );
}

/**
 * Delete an audio file by its cld_files UUID. Best-effort.
 */
export async function deleteAudioFromStorage(fileId: string): Promise<void> {
  try {
    await Files.deleteFile(fileId, { hardDelete: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Error deleting audio file:", error);
  }
}

/**
 * Get a fresh signed URL for an audio file. Auto-refreshes before
 * expiry via the handler's expiry wheel.
 */
export async function getAudioUrl(fileId: string): Promise<string> {
  const url = await fileHandler.use({ kind: "file_id", fileId }).as({
    kind: "html_src",
  });
  return url;
}

/**
 * Download audio bytes for transcription.
 */
export async function downloadAudioBlob(fileId: string): Promise<Blob> {
  return fileHandler.use({ kind: "file_id", fileId }).as({ kind: "blob" });
}
