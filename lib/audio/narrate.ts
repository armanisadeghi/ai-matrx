// lib/audio/narrate.ts
//
// The reusable narration primitive: text → durable audio file. One call turns a
// string into a persisted, re-mintable audio file and hands back the DURABLE
// handle (`fileId`) — never a transient blob/object URL.
//
// Pipeline:
//   1. POST the text to `/api/audio/text-to-speech` (Groq playai-tts) → WAV blob.
//   2. Upload that blob through the canonical file handler (`fileHandler.upload`)
//      so it becomes a real `cld_files` row with durable, re-mintable URLs.
//   3. Stamp `metadata.narration` on the row so the audio's provenance (source
//      text, voice, model, source ref) travels with the file.
//
// Why the file handler and not a raw object URL: a `URL.createObjectURL(blob)`
// dies with the page and can't self-heal. The product of narration is the
// durable `fileId`; the returned `url` is a convenience for immediate playback,
// not something to persist. Re-mint from `fileId` when you need a fresh URL.
//
// Never throws — returns `{ error }` on any failure.

"use client";

import { fileHandler } from "@/features/files/handler/handler";

export interface NarrateOptions {
  /** playai-tts voice. Defaults to the route default 'Cheyenne-PlayAI'. */
  voice?: string;
  /** TTS model. Defaults to the route default 'playai-tts'. */
  model?: string;
  /** Provenance: the kind of entity this narration belongs to (e.g. 'fc_card'). */
  sourceType?: string;
  /** Provenance: the id of that entity. */
  sourceId?: string;
}

export interface NarrateSuccess {
  /** Durable cld_files id — the canonical, re-mintable handle. Persist THIS. */
  fileId: string;
  /** A URL for immediate playback. Convenience only — do not persist. */
  url: string;
}

export interface NarrateFailure {
  error: string;
}

const DEFAULT_VOICE = "Cheyenne-PlayAI";
const DEFAULT_MODEL = "playai-tts";

/**
 * Narrate `text` to a durable audio file. Returns `{ fileId, url }` on success
 * or `{ error }` on any failure (TTS, upload, or unexpected). Dedup is out of
 * scope for v1 — every call mints a fresh file.
 */
export async function narrate(
  text: string,
  opts: NarrateOptions = {},
): Promise<NarrateSuccess | NarrateFailure> {
  const trimmed = text?.trim();
  if (!trimmed) return { error: "narrate: text is required" };

  const voice = opts.voice ?? DEFAULT_VOICE;
  const model = opts.model ?? DEFAULT_MODEL;

  // ── 1. TTS → WAV blob ──────────────────────────────────────────────────
  let blob: Blob;
  try {
    const res = await fetch("/api/audio/text-to-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed, voice, model }),
    });
    if (!res.ok) {
      // The route returns a JSON `{ error }` on failure; fall back to status.
      let detail = `HTTP ${res.status}`;
      try {
        const body: unknown = await res.json();
        if (body && typeof body === "object" && "error" in body) {
          detail = String((body as { error: unknown }).error);
        }
      } catch {
        // non-JSON error body — keep the status string.
      }
      return { error: `narrate: text-to-speech failed (${detail})` };
    }
    blob = await res.blob();
  } catch (e) {
    return { error: `narrate: text-to-speech request failed (${asMessage(e)})` };
  }

  // ── 2. Upload to a durable file ────────────────────────────────────────
  try {
    const filename = `narration-${Date.now()}.wav`;
    const file = await fileHandler.upload(
      { kind: "blob", blob, fileName: filename, mime: "audio/wav" },
      {
        folderPath: "Narrations",
        // 3. Stamp provenance — UploadOpts.metadata is written onto the row.
        metadata: {
          narration: {
            source_text: trimmed,
            voice,
            model,
            source_type: opts.sourceType ?? null,
            source_id: opts.sourceId ?? null,
            narrated_at: new Date().toISOString(),
          },
        },
      },
    );

    if (!file.fileId) {
      return { error: "narrate: upload returned no fileId (durable handle missing)" };
    }
    // The durable handle is `fileId`. `url` is whatever the handler resolved
    // (public CDN / share URL); it's a convenience for immediate playback.
    return { fileId: file.fileId, url: file.url ?? "" };
  } catch (e) {
    return { error: `narrate: upload failed (${asMessage(e)})` };
  }
}

function asMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Unknown error";
}
