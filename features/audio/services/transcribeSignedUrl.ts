// features/audio/services/transcribeSignedUrl.ts
//
// THE one client-side entry point for "I have a URL the transcription backend
// can fetch — give me the transcript." It POSTs to `/api/audio/transcribe-url`
// (Groq Whisper, up to ~100 MB, and it demuxes video containers too), validates
// the envelope, and returns the canonical `TranscriptionResult`.
//
// This exists because three callers were hand-rolling the identical
// fetch+validate against the same route:
//   • features/transcript-studio AudioImportDialog (import an audio/video file)
//   • features/audio audioFallbackUpload (chunked-transcription fallback)
//   • features/education/onboard useIngest (Study Kit audio/video ingest)
// One contract, one place. The URL must be reachable by the backend — a
// cld_files signed S3 URL (`fileHandler.use({file_id}).as({html_src})`) or an
// allowlisted backend URL. See app/api/audio/transcribe-url/route.ts.

import { AUDIO_API_ROUTES } from "../constants";
import type { TranscriptionOptions, TranscriptionResult } from "../types";

/**
 * Transcribe audio/video reachable at `url` via the Groq-Whisper URL route.
 * Throws with the backend's message on a non-OK / `success:false` response so
 * callers surface a real error instead of a silent empty transcript.
 */
export async function transcribeSignedUrl(
  url: string,
  options?: TranscriptionOptions,
): Promise<TranscriptionResult> {
  const body: Record<string, string> = { url };
  if (options?.language) body.language = options.language;
  if (options?.prompt) body.prompt = options.prompt;

  const res = await fetch(AUDIO_API_ROUTES.TRANSCRIBE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => null)) as TranscriptionResult | null;
  if (!res.ok || !data || data.success === false) {
    throw new Error(
      data?.error || `Transcription failed (${res.status} ${res.statusText}).`,
    );
  }
  return data;
}
