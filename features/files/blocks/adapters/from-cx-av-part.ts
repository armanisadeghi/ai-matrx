/**
 * features/files/blocks/adapters/from-cx-av-part.ts
 *
 * Convert a DB-stored `cx_message.content[]` media part (kind: "audio" |
 * "video") into the `AudioOutputData` / `VideoOutputData` render-block payload
 * the chat media renderers consume.
 *
 * This is the audio/video twin of the image adapter
 * (`../image/adapters/from-cx-media-part.ts`) and exists for the same reason:
 * **media identity is the `file_id`, never a URL.** The stored `url` is
 * whatever happened to be visible at save time — usually a signed S3 URL that
 * expired long ago. `file_id` is what lets `buildMediaSource` → `useFileSrc`
 * re-mint a fresh, durable URL on every render.
 *
 * `file_id` lives at the TOP LEVEL of the stored media part (and is sometimes
 * mirrored into `metadata`); the URL flavors are dumped into `metadata`. Both
 * are lifted back out here so the round-trip is lossless.
 */

import type {
  AudioMediaPart,
  AudioOutputData,
  VideoMediaPart,
  VideoOutputData,
} from "@/types/python-generated/stream-events";

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

interface LiftedUrls {
  url: string;
  file_id: string | null;
  cdn_url: string | null;
  signed_url: string | null;
  download_url: string | null;
}

function liftUrls(part: AudioMediaPart | VideoMediaPart): LiftedUrls {
  const metadata = (part.metadata ?? null) as Record<string, unknown> | null;
  const cdn = str(metadata?.cdn_url);
  const signed = str(metadata?.signed_url);
  const download = str(metadata?.download_url);
  return {
    // The on-disk `url` is a save-time snapshot; forward it as the fallback
    // the handler only uses when no identity is available.
    url: str(part.url) ?? cdn ?? signed ?? "",
    file_id: str(part.file_id) ?? str(metadata?.file_id),
    cdn_url: cdn,
    signed_url: signed,
    download_url: download,
  };
}

export function fromCxAudioPart(part: AudioMediaPart): AudioOutputData & {
  transcription_result: string | null;
} {
  return {
    type: "audio_output",
    ...liftUrls(part),
    mime_type: part.mime_type ?? "audio/*",
    transcription_result: part.transcription_result ?? null,
  };
}

export function fromCxVideoPart(part: VideoMediaPart): VideoOutputData {
  return {
    type: "video_output",
    ...liftUrls(part),
    mime_type: part.mime_type ?? "video/*",
  };
}
