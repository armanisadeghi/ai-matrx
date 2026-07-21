/**
 * features/media-capture/recording/journal-recovery.ts
 *
 * The ONE finish-recovery flow for interrupted/unsaved recording journals:
 * read the emitted chunks, assemble the Blob (journal = single source of
 * truth), build the capture metadata, upload via the canonical uploader, and
 * discard the journal. Shared by the Capture Studio recovery banner and the
 * /camera library's Recovery section — never fork a second assemble+save.
 *
 * Recovery semantics (plan §5 invariant 11): only emitted chunks are ever
 * promised; the returned `recoveredNote` phrases the result LOUDLY as
 * "Recovered N of M segment(s)" — callers surface it verbatim, never as a
 * whole recording.
 */

import {
  buildAudioCaptureMetadata,
  buildVideoCaptureMetadata,
  type CaptureMetadata,
} from "@/features/media-capture/core/capture-types";
import { extensionForMime } from "@/features/media-capture/core/mime-selection";
import {
  discardJournal,
  readChunks,
  type RecoverableJournal,
} from "@/features/media-capture/recording/chunk-journal";
import { uploadCapture } from "@/features/media-capture/upload/capture-uploader";
import { recordCaptureFailure } from "@/features/media-capture/runtime/mediaCaptureDiagnostics";

export type JournalRecoveryResult =
  | {
      outcome: "saved";
      fileId: string;
      /** LOUD partial phrasing — surface verbatim. */
      recoveredNote: string;
    }
  | {
      /** No chunks survived — the journal was discarded. */
      outcome: "empty";
    };

function recoveryFileName(mime: string, createdAt: number): string {
  const stamp = new Date(createdAt).toISOString().replace(/[:.]/g, "-");
  return `capture-${stamp}.${extensionForMime(mime)}`;
}

/**
 * Assemble + save one recoverable journal. Throws on read/upload failure
 * (after recording a `recovery` diagnostics-ring entry) — the journal is
 * PRESERVED on failure so the user can retry; it is discarded only after a
 * durable save (or when nothing survived).
 */
export async function finishJournalRecovery(
  entry: RecoverableJournal,
): Promise<JournalRecoveryResult> {
  const id = entry.manifest.capture_id;
  try {
    const read = await readChunks(id);
    if (read.chunks.length === 0) {
      await discardJournal(id);
      return { outcome: "empty" };
    }
    const mime = read.manifest.mime ?? read.chunks[0].type ?? "";
    const kind: "video" | "audio" = mime.startsWith("audio/")
      ? "audio"
      : "video";
    const blob = new Blob(read.chunks, mime ? { type: mime } : undefined);
    const finalMime = blob.type || mime || "video/webm";
    const metadata: CaptureMetadata =
      kind === "video"
        ? buildVideoCaptureMetadata({
            source: "browser-media-devices",
            sourceFeature: read.manifest.source_feature,
            // Effective dims are unknown after a crash — the server probe
            // writes the canonical width/height columns from the bytes.
            sourceSettings: {
              width: 0,
              height: 0,
              frame_rate: null,
              facing_mode: null,
            },
            framing: "full-frame",
            mirroredOutput: false,
            hasAudio: read.manifest.has_audio ?? false,
            recorderMimeType: finalMime,
            capturedAt: new Date(read.manifest.created_at).toISOString(),
          })
        : buildAudioCaptureMetadata({
            source: "browser-media-devices",
            sourceFeature: read.manifest.source_feature,
            recorderMimeType: finalMime,
            capturedAt: new Date(read.manifest.created_at).toISOString(),
          });
    const file = new File(
      [blob],
      recoveryFileName(finalMime, read.manifest.created_at),
      { type: finalMime },
    );
    const uploaded = await uploadCapture({ file, capture: metadata });
    await discardJournal(id);
    const recoveredNote =
      `Recovered ${read.chunks.length} of ${read.expectedChunks} saved segment(s)` +
      (entry.interrupted ? " from an interrupted recording" : "");
    // The uploader throws when fileId is absent, so this is safe.
    return {
      outcome: "saved",
      fileId: uploaded.fileId as string,
      recoveredNote,
    };
  } catch (err) {
    recordCaptureFailure({
      scope: "recovery",
      message:
        err instanceof Error
          ? err.message
          : `Recovering journal "${id}" failed.`,
    });
    throw err;
  }
}
