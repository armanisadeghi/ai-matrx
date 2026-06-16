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
   * this id. We intentionally do NOT return a `filePath`: a `recording`
   * upload is relocated by the backend under the hidden system namespace
   * (`system-files/transcripts/Recordings/...`), so any path the client
   * constructs would be wrong. See
   * docs/files/transcript-recordings-system-relocation.md.
   */
  fileId: string;
  filename: string;
  size: number;
}

export type AudioUploadSource = "recording" | "import";

export interface SaveAudioOptions {
  /**
   * What produced this audio — decides whether it's hidden or visible:
   *
   * - `"recording"` (default): a microphone capture. Tagged
   *   `origin: "transcripts"`, which the backend relocates under the hidden
   *   `system-files/transcripts/Recordings/...` root. Machine-named, never
   *   shown in the file tree or Recents — managed only via the Transcripts UI.
   *
   * - `"import"`: a file the user deliberately chose (AudioImportDialog).
   *   It stays an ordinary, VISIBLE user file: no `origin` tag (so the
   *   backend leaves it where it lands — anything not in the origin map is
   *   untouched), original filename preserved, stored under
   *   `Transcripts/Imports`. A file the user picked is theirs to see.
   */
  source?: AudioUploadSource;
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
  options: SaveAudioOptions = {},
): Promise<UploadResult> {
  const validation = validateAudioFile(audioBlob);
  if (!validation.valid) throw new Error(validation.error);

  const isImport = (options.source ?? "recording") === "import";

  // Present a clean `audio/*` type + matching extension so the file lands in
  // cld_files classified as audio, not video. Recordings (webm/opus, often
  // with an empty blob type) normalize to `audio/webm`; imported files keep
  // their true audio type (mp3 → audio/mpeg, m4a/mp4 → audio/mp4, etc.).
  //
  // Naming: recordings get the machine `recording_<iso>_<rand>` name (they're
  // hidden, never browsed). Imports keep the user's original filename — it's a
  // visible file they chose. `toAudioFile` is the single send-site File builder
  // (the audio-mime rule: never hand-build an audio `File`); it also corrects
  // the extension to match the normalized type when they disagree.
  const sourceName = audioBlob instanceof File ? audioBlob.name : undefined;
  const contentType = normalizeAudioContentType(audioBlob.type, sourceName);
  const ext = audioExtensionForType(contentType);
  const desiredName =
    isImport && sourceName
      ? sourceName
      : generateAudioFilename(isImport ? "audio" : "recording", ext);
  const file = toAudioFile(audioBlob, { fileName: desiredName });

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      attempt++;
      onProgress?.(0, `Uploading audio (attempt ${attempt}/${maxRetries})...`);

      const normalized = await fileHandler.upload(
        { kind: "file", file },
        isImport
          ? {
              // Imports stay VISIBLE in the user's tree (a file they chose).
              // No `origin` tag → the backend leaves it in place (anything not
              // in the origin→system-folder map is untouched).
              folderPath: "Transcripts/Imports",
              visibility: "private",
              metadata: { source: "transcript_import", imported_by: userId },
            }
          : {
              // `folderPath` is a hint; the backend remaps `origin:
              // "transcripts"` uploads to the hidden system root
              // `system-files/transcripts/...`.
              folderPath: "Transcripts/Recordings",
              visibility: "private",
              // `origin: "transcripts"` is the REQUIRED signal that triggers
              // server-side relocation + hiding. Drop it and the recording
              // lands in the user namespace and reappears in the file tree.
              metadata: { origin: "transcripts", recorded_by: userId },
            },
      );

      onProgress?.(100, "Upload complete!");

      if (!normalized.fileId) {
        throw new Error("Upload succeeded but no fileId returned");
      }

      return {
        fileId: normalized.fileId,
        filename: file.name,
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
