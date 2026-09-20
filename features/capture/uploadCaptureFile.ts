// features/capture/uploadCaptureFile.ts — THE CREW SHEET'S BYTES, IN THE ONE BYTE STORE.
//
// PRODUCTS row 15. A photograph or a voice note taken on a capture sheet goes exactly
// where every other captured file on this platform goes: `files.files`, through
// `features/media-capture/upload/capture-uploader.ts` → `fileHandler.upload`, filed under
// the organization's own capture subtree. That feature names its failure class in its own
// FEATURE.md — *"inventing a capture table or a second byte path"* — and this file is the
// reason the crew sheet does not become one.
//
// WHAT THIS ADDS AND WHAT IT REFUSES TO ADD. It builds the `metadata.capture` v1 payload
// the uploader validates (`isCaptureMetadata` rejects unknown keys, camelCase drift, and
// any device identifier at any depth). A file that arrives through the `<input capture>`
// control was taken by the phone's own camera app, so THE SOURCE IS `capture-input`, not
// `browser-media-devices` — the second would be a claim that this code held a
// `getUserMedia` lease and measured the stream, which it did not. The photo arm has to
// declare `source_settings`, and the honest answer for a file the OS handed us is the
// image's own decoded size, read here, with a zero frame rate and no facing mode rather
// than an invented one. If the image will not decode, the upload still happens with the
// size it actually reports.

import {
  buildAudioCaptureMetadata,
  buildPhotoCaptureMetadata,
  type CaptureMetadata,
} from "@/features/media-capture/core/capture-types";
import { uploadCapture } from "@/features/media-capture/upload/capture-uploader";

/** The decoded pixel size of an image File, or nulls when it will not decode. */
async function decodedSize(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return size;
    } catch {
      /* falls through to the honest zero below */
    }
  }
  return { width: 0, height: 0 };
}

/**
 * The `upload` port `<RecordsMount>` binds for the capture sheet. Answers the
 * `files.files` id, which is what the File record made from this points at — never a URL
 * (renders go through `<InlineMediaRef>`).
 */
export async function uploadCaptureFile(
  file: File,
): Promise<{ ok: true; fileId: string } | { ok: false; reason: string }> {
  try {
    const audio = file.type.startsWith("audio/");
    const capture: CaptureMetadata = audio
      ? buildAudioCaptureMetadata({
          source: "capture-input",
          sourceFeature: "crew-capture-sheet",
          recorderMimeType: file.type || "audio/webm",
        })
      : buildPhotoCaptureMetadata({
          source: "capture-input",
          sourceFeature: "crew-capture-sheet",
          sourceSettings: { ...(await decodedSize(file)), frame_rate: null, facing_mode: null },
          framing: "full-frame",
          mirroredOutput: false,
        });

    const uploaded = await uploadCapture({ file, capture });
    return { ok: true, fileId: uploaded.fileId! };
  } catch (err) {
    // The queue shows this sentence beside the capture and keeps it on the phone. It is
    // never swallowed and the capture is never marked sent.
    return {
      ok: false,
      reason:
        err instanceof Error
          ? `That file could not be uploaded: ${err.message}`
          : "That file could not be uploaded.",
    };
  }
}
