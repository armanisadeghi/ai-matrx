// features/transcripts/service/audioStorageService.ts
//
// Audio storage for the transcripts feature. Goes through the universal
// file handler — every audio recording becomes a `cld_files` row, with
// the same RLS, signed-URL refresh, and lifecycle as any other file in
// the app. Single system, no Supabase Storage buckets.

import { fileHandler } from "@/features/files";
import { RECORDING_LIMITS } from "../constants/recording";
import {
  normalizeAudioContentType,
  audioExtensionForType,
  toAudioFile,
} from "@/features/audio/utils/audio-mime";

interface UploadResult {
  /**
   * cld_files UUID — the only durable handle. Everything downstream
   * (transcripts.audio_file_path, playback, download, delete) keys off
   * this id. We intentionally do NOT return a `filePath`: the backend
   * relocates `origin: "transcripts"` uploads under the hidden system
   * namespace (`system-files/transcripts/Recordings/...`), so any path the
   * client constructs would be wrong. See
   * docs/files/transcript-recordings-system-relocation.md.
   */
  fileId: string;
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
      error:
        "Audio file is empty. Please ensure you recorded audio before stopping.",
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

export function generateAudioFilename(
  prefix: string = "recording",
  ext: string = "webm",
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const randomId = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${randomId}.${ext}`;
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

  // Present a clean `audio/*` type + matching extension so the file lands in
  // cld_files classified as audio, not video. Recordings (webm/opus, often
  // with an empty blob type) normalize to `audio/webm`; imported files keep
  // their true audio type (mp3 → audio/mpeg, m4a/mp4 → audio/mp4, etc.).
  //
  // We need the `recording_<iso>_<rand>` name convention, so derive the
  // extension from the normalized type first, then let `toAudioFile` stamp
  // the clean type + matching extension (the audio-mime rule: never
  // hand-build an audio `File` at a send/upload site).
  const sourceName = audioBlob instanceof File ? audioBlob.name : undefined;
  const contentType = normalizeAudioContentType(audioBlob.type, sourceName);
  const filename = generateAudioFilename(
    "recording",
    audioExtensionForType(contentType),
  );
  const file = toAudioFile(audioBlob, { fileName: filename });

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      attempt++;
      onProgress?.(0, `Uploading audio (attempt ${attempt}/${maxRetries})...`);

      const normalized = await fileHandler.upload(
        { kind: "file", file },
        {
          // `folderPath` is a hint; the backend remaps `origin: "transcripts"`
          // uploads to the hidden system root `system-files/transcripts/...`.
          folderPath: "Transcripts/Recordings",
          visibility: "private",
          // `origin: "transcripts"` is the REQUIRED signal that triggers
          // server-side relocation + hiding. Drop it and the recording lands
          // in the user namespace and reappears in the file tree.
          metadata: { origin: "transcripts", recorded_by: userId },
        },
      );

      onProgress?.(100, "Upload complete!");

      if (!normalized.fileId) {
        throw new Error("Upload succeeded but no fileId returned");
      }

      return {
        fileId: normalized.fileId,
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
 *
 * Routes through `fileHandler.remove` (which dispatches the canonical
 * deleteFile thunk) so the Redux slice is updated atomically with the
 * REST DELETE — calling `Files.deleteFile` directly leaves the slice
 * waiting on the realtime echo and produces a race window.
 */
export async function deleteAudioFromStorage(fileId: string): Promise<void> {
  try {
    await fileHandler.remove(fileId, { hard: true });
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
