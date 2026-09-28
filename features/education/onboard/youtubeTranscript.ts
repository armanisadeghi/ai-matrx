// features/education/onboard/youtubeTranscript.ts
//
// THE Study-Kit front door's entry point for "turn a YouTube link into the
// words that were actually SPOKEN." It calls aidream's real-transcript route
// (`POST /media/youtube/transcript`, agent 0cd86da2, Gemini) — NOT the page
// scraper — and returns the transcript text so `useIngest` can normalize it to
// text + a durable file anchor exactly like every other format.
//
// The transcript streams back as chunk text, so `consumeStream` hands it to us
// as `accumulatedText`. A video with no captions/speech yields empty text plus
// a non-fatal warning `note` (never a thrown error) — the caller degrades to
// the honest "no transcript" fallback rather than faking success.

"use client";

import { consumeStream } from "@/lib/api/stream-parser";
import { ENDPOINTS } from "@/lib/api/endpoints";
import type { YouTubeTranscriptSourceData } from "@/types/python-generated/stream-events";

export interface YouTubeTranscriptResult {
  /** The spoken transcript (empty when the video has no captions/speech). */
  text: string;
  /** Server-provided reason when no transcript was produced (for honest UX). */
  note?: string;
  /**
   * The Source the server landed the timed transcript as (one portion per
   * segment). Absent when the video had no timed segments, or the Source could
   * not be saved — `note` then says why.
   */
  source?: YouTubeTranscriptSourceData;
}

/**
 * Fetch a YouTube video's spoken transcript via the aidream real-transcript
 * route. `post` is `useBackendApi().post` (auth + active-backend aware). Throws
 * only on a transport/stream-level ERROR; a captionless video returns empty
 * `text` so the caller can fall back honestly.
 */
export async function fetchYouTubeTranscript(
  post: (
    endpoint: string,
    body: unknown,
    signal?: AbortSignal,
  ) => Promise<Response>,
  url: string,
  signal?: AbortSignal,
): Promise<YouTubeTranscriptResult> {
  const response = await post(
    ENDPOINTS.media.youtubeTranscript,
    { youtube_url: url },
    signal,
  );

  let note: string | undefined;
  let source: YouTubeTranscriptSourceData | undefined;
  const { accumulatedText } = await consumeStream(
    response,
    {
      onData: (data) => {
        if (data.type === "youtube_transcript_source" && "processed_document_id" in data)
          source = data as YouTubeTranscriptSourceData;
      },
      onWarning: (w) => {
        note = w.user_message || w.system_message || note;
      },
      onError: (e) => {
        // A stream-level ERROR invalidates the whole response — surface it so
        // the caller shows a real error, never a silent empty transcript.
        throw new Error(
          e.user_message || e.message || "YouTube transcription failed.",
        );
      },
    },
    signal,
  );

  return { text: accumulatedText.trim(), note, source };
}
