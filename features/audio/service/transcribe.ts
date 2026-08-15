/**
 * transcribe() — THE entry point for turning audio into text, app-wide.
 *
 * The listen-lane twin of `speak()`. One call handles every source a caller can
 * have — a recorded Blob, a File the user picked, a file already in cloud
 * storage, or a URL — and routes it to the chosen engine.
 *
 * WHY ONE ENTRY: callers used to pick between `transcribeAudioFile`,
 * `transcribeCloudFile`, and `transcribeAudioUrl` themselves, and each site
 * decided (or forgot) which was cheapest. Choosing wrong is expensive: a file
 * that already lives in cloud storage must be transcribed BY REFERENCE — the
 * bytes never leave the server, there is no re-upload, and the server demuxes
 * video and chunks past the provider's size limit. Passing `{ fileId }` gets
 * that for free; the old way silently re-uploaded megabytes from the browser.
 *
 * Engine selection is a server catalog alias (see `engines.ts`), so swapping
 * the transcription vendor is a server change with no client release.
 */

import {
  transcribeAudioFile,
  transcribeAudioUrl,
  transcribeCloudFile,
} from "@/features/audio/services/speechApi";
import type { TranscriptionResult } from "@/features/audio/types";
import { listenEngine, type ListenEngineId } from "./engines";

/**
 * Where the audio comes from. Prefer `fileId` whenever the media is already
 * saved — it is the only source that avoids a re-upload.
 */
export type TranscribeSource =
  | { kind: "file"; file: File }
  | { kind: "blob"; blob: Blob; fileName?: string }
  | { kind: "fileId"; fileId: string }
  | { kind: "url"; url: string };

export interface TranscribeOptions {
  engine?: ListenEngineId;
  /** BCP-47 hint (e.g. "en"). Omit to let the engine detect it. */
  language?: string;
  organizationId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Default container/name for a recorded Blob that has no file name. */
function fileFromBlob(blob: Blob, fileName?: string): File {
  const type = blob.type || "audio/webm";
  const ext = type.includes("mp4")
    ? "mp4"
    : type.includes("mpeg") || type.includes("mp3")
      ? "mp3"
      : type.includes("wav")
        ? "wav"
        : type.includes("ogg")
          ? "ogg"
          : "webm";
  return new File([blob], fileName ?? `recording.${ext}`, { type });
}

/** Transcribe audio (or video) from any source through one engine. */
export async function transcribe(
  source: TranscribeSource,
  options: TranscribeOptions = {},
): Promise<TranscriptionResult> {
  const engine = listenEngine(options.engine);
  const { language, organizationId, signal, timeoutMs } = options;

  switch (source.kind) {
    case "fileId":
      return transcribeCloudFile(
        {
          fileId: source.fileId,
          language,
          model: engine.model,
          organizationId,
        },
        signal,
      );
    case "url":
      return transcribeAudioUrl(
        source.url,
        { language, model: engine.model },
        organizationId,
      );
    case "file":
      return transcribeAudioFile(
        source.file,
        { language, model: engine.model },
        { signal, timeoutMs },
      );
    case "blob":
      return transcribeAudioFile(
        fileFromBlob(source.blob, source.fileName),
        { language, model: engine.model },
        { signal, timeoutMs },
      );
  }
}
