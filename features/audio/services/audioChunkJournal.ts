/**
 * Audio Chunk Journal — eager per-chunk upload for cross-device recovery
 * (FOUND_DEFECTS D7).
 *
 * The IndexedDB safety net (`audioSafetyStore`) is per-device: a recording
 * captured on a phone whose background full-audio upload never finished used
 * to be recoverable ONLY from that phone. This journal closes the gap by
 * uploading every MediaRecorder chunk to `cld_files` in the background WHILE
 * the recording is live, and recording a row per chunk in
 * `transcripts.studio_recording_chunks` keyed by the recorder's crash-safe
 * `safety_id` (the same id `studio_recording_segments.safety_id` carries).
 * Any device that later opens the session can then reassemble the audio from
 * the uploaded chunks (see `reconcileStuckRecordingsThunk`).
 *
 * Invariants:
 * - ADDITIONAL layer, never a replacement — the IndexedDB save always happens
 *   first and is untouched. A journal failure must never affect recording:
 *   `journalChunk` is fire-and-forget, retries with backoff, and only screams
 *   to the console on persistent failure.
 * - Chunk files are SYSTEM staging files, not "my files": they live in the
 *   hidden `.matrx-tmp/transcripts` folder (same convention as
 *   `audioFallbackUpload`) with `ephemeral: true` metadata, and are
 *   hard-deleted the moment the recording's durable full-audio upload lands
 *   (`discardChunkJournal`).
 * - Per-safetyId uploads run SEQUENTIALLY (one small ~40 KB request at a
 *   time) so a mobile radio is never saturated and ordering is preserved.
 *   Everything is async fetch work — the UI thread is never blocked.
 */

"use client";

import { fileHandler } from "@/features/files/handler/handler";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { supabase } from "@/utils/supabase/client";
import { getUserId } from "@/utils/auth/getUserId";
import {
  normalizeAudioContentType,
  audioExtensionForType,
  toAudioFile,
} from "../utils/audio-mime";

const LOG_PREFIX = "[audio-chunk-journal]";
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1_500;

export interface JournaledChunkRow {
  safety_id: string;
  chunk_index: number;
  file_id: string;
  mime_type: string;
  size_bytes: number;
}

export interface AssembledJournalAudio {
  blob: Blob;
  mimeType: string;
  chunkCount: number;
  /** Chunk indices that were journaled but whose bytes failed to download. */
  missingIndices: number[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One sequential upload chain per recording cycle, so chunks go out one at a
// time and in order. The chain never rejects (every link swallows after its
// own retries), so a failed chunk never poisons the ones behind it.
const queues = new Map<string, Promise<void>>();
// Consecutive persistent failures per safetyId — used to escalate the log.
const failureCounts = new Map<string, number>();

async function uploadAndJournalOnce(
  safetyId: string,
  chunkIndex: number,
  blob: Blob,
  mimeType: string,
): Promise<void> {
  const contentType = normalizeAudioContentType(mimeType || blob.type);
  const ext = audioExtensionForType(contentType);

  // Hidden staging folder — idempotent; a failure just falls back to root.
  let folderPath: string | undefined;
  try {
    await fileHandler.ensureFolderPath({
      folderPath: CloudFolders.TMP_TRANSCRIPTS,
      visibility: "private",
    });
    folderPath = CloudFolders.TMP_TRANSCRIPTS;
  } catch {
    folderPath = undefined;
  }

  const file = toAudioFile(blob, {
    fileName: `chunk_${safetyId}_${String(chunkIndex).padStart(4, "0")}.${ext}`,
  });

  const normalized = await fileHandler.upload(
    { kind: "file", file },
    {
      folderPath,
      visibility: "private",
      metadata: {
        origin: "audio-chunk-journal",
        ephemeral: true,
        safety_id: safetyId,
        chunk_index: chunkIndex,
      },
    },
  );
  if (!normalized.fileId) {
    throw new Error("chunk upload returned no fileId");
  }

  // Journal row — the durable pointer recovery reads. Idempotent: a retry
  // that re-uploads after a failed insert lands on the unique
  // (safety_id, chunk_index) and is ignored.
  const { error } = await supabase
    .schema("transcripts")
    .from("studio_recording_chunks")
    .upsert(
      {
        safety_id: safetyId,
        chunk_index: chunkIndex,
        file_id: normalized.fileId,
        mime_type: contentType,
        size_bytes: blob.size,
      },
      { onConflict: "safety_id,chunk_index", ignoreDuplicates: true },
    );
  if (error) {
    // The uploaded file would be orphaned without its row — remove it so a
    // retry starts clean (best-effort; staging is ephemeral either way).
    void fileHandler.remove(normalized.fileId, { hard: true }).catch(() => {});
    throw new Error(`journal insert failed: ${error.message}`);
  }
}

/**
 * Fire-and-forget: upload one recorder chunk + journal it. Never throws,
 * never blocks the caller. No-op for guests (no auth user → RLS would
 * reject) and for empty blobs.
 */
export function journalChunk(input: {
  safetyId: string;
  chunkIndex: number;
  blob: Blob;
  mimeType: string;
}): void {
  const { safetyId, chunkIndex, blob, mimeType } = input;
  if (!safetyId || blob.size === 0) return;
  if (!getUserId()) return; // guest — journal requires an authed owner

  const prev = queues.get(safetyId) ?? Promise.resolve();
  const next = prev.then(async () => {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await uploadAndJournalOnce(safetyId, chunkIndex, blob, mimeType);
        failureCounts.delete(safetyId);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_ATTEMPTS) {
          await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));
        }
      }
    }
    // Persistent failure — LOUD. Recording is unaffected (IndexedDB has the
    // chunk); this only degrades cross-device recovery for this cycle.
    const failures = (failureCounts.get(safetyId) ?? 0) + 1;
    failureCounts.set(safetyId, failures);
    console.error(
      `${LOG_PREFIX} chunk ${chunkIndex} of ${safetyId} failed to journal after ` +
        `${MAX_ATTEMPTS} attempts (${failures} chunk(s) lost from this cycle's ` +
        `cross-device journal — same-device IndexedDB recovery is unaffected):`,
      lastError,
    );
  });
  queues.set(safetyId, next);
}

/** Resolve when every queued journal upload for this cycle has settled. */
export function awaitJournalIdle(safetyId: string): Promise<void> {
  return queues.get(safetyId) ?? Promise.resolve();
}

/** All journaled chunk rows for a recording cycle, in playback order. */
export async function listJournaledChunks(
  safetyId: string,
): Promise<JournaledChunkRow[]> {
  if (!safetyId) return [];
  const { data, error } = await supabase
    .schema("transcripts")
    .from("studio_recording_chunks")
    .select("safety_id, chunk_index, file_id, mime_type, size_bytes")
    .eq("safety_id", safetyId)
    .order("chunk_index", { ascending: true });
  if (error) {
    throw new Error(`${LOG_PREFIX} list failed: ${error.message}`);
  }
  return data ?? [];
}

/**
 * Reassemble a recording's audio from its journaled chunks: download each
 * chunk's bytes and concatenate in index order — byte-identical to how the
 * live path assembles the full blob from in-memory chunks
 * (`new Blob(allChunkBlobs)` in `useChunkedRecordAndTranscribe`).
 *
 * Returns null when nothing is journaled. A chunk whose bytes fail to
 * download is skipped (partial audio beats none) and reported in
 * `missingIndices` — the caller decides how loud to be.
 */
export async function assembleJournaledAudio(
  safetyId: string,
): Promise<AssembledJournalAudio | null> {
  const rows = await listJournaledChunks(safetyId);
  if (rows.length === 0) return null;

  const parts: Blob[] = [];
  const missingIndices: number[] = [];
  for (const row of rows) {
    try {
      const part = await fileHandler
        .use({ kind: "file_id", fileId: row.file_id })
        .as({ kind: "blob" });
      if (part && part.size > 0) {
        parts.push(part);
      } else {
        missingIndices.push(row.chunk_index);
      }
    } catch (err) {
      missingIndices.push(row.chunk_index);
      console.warn(
        `${LOG_PREFIX} chunk ${row.chunk_index} of ${safetyId} journaled but ` +
          "its bytes failed to download — assembling without it:",
        err,
      );
    }
  }
  if (parts.length === 0) return null;

  const mimeType = rows[0]!.mime_type || "audio/webm";
  return {
    blob: new Blob(parts, { type: mimeType }),
    mimeType,
    chunkCount: parts.length,
    missingIndices,
  };
}

/**
 * Delete a cycle's journal — rows AND staging chunk files. Called once the
 * recording's durable full-audio upload has landed (or the recording was
 * explicitly discarded). Best-effort: a failure leaves ephemeral staging
 * files behind, never breaks the caller.
 */
export async function discardChunkJournal(safetyId: string): Promise<void> {
  if (!safetyId) return;
  try {
    // Let any in-flight uploads for this cycle settle first, so we don't
    // race a chunk landing right after the sweep.
    await awaitJournalIdle(safetyId);
    queues.delete(safetyId);
    failureCounts.delete(safetyId);

    const rows = await listJournaledChunks(safetyId);
    for (const row of rows) {
      try {
        await fileHandler.remove(row.file_id, { hard: true });
      } catch {
        // Staging file cleanup is best-effort; backend retention prunes tmp.
      }
    }
    const { error } = await supabase
      .schema("transcripts")
      .from("studio_recording_chunks")
      .delete()
      .eq("safety_id", safetyId);
    if (error) throw new Error(error.message);
  } catch (err) {
    console.warn(`${LOG_PREFIX} discard for ${safetyId} failed:`, err);
  }
}
