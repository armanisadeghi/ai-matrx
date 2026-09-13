/**
 * Canonical session-time formatting for the studio / scribe.
 *
 * `formatTimecode` renders seconds-from-session-start as `m:ss` (or `h:mm:ss`
 * past an hour) — the ONE timecode format every transcript surface shows, so a
 * segment reads identically wherever it's displayed or copied. Previously
 * duplicated inline in RawTranscriptColumn + CleanedTranscriptColumn; this is
 * the single source of truth.
 */

import { formatDurationSeconds } from "@ai-matrx/kit/format";

export function formatTimecode(sec: number): string {
  return formatDurationSeconds(sec, { style: "clock" });
}

/**
 * Build the standard timestamped transcript text from time-anchored segments:
 * one `[m:ss] text` entry per segment. This is the single standard for any
 * human-facing transcript DISPLAY or copy/export across the app (the plain,
 * un-timecoded selectors remain for machine consumers — agent context, Knowledge,
 * search — that need raw text).
 */
export function buildTimestampedTranscript(
  segments: ReadonlyArray<{ tStart: number; text: string }>,
  joiner = "\n\n",
): string {
  return segments
    .map((seg) => {
      const text = seg.text.trim();
      return text ? `[${formatTimecode(seg.tStart)}] ${text}` : "";
    })
    .filter(Boolean)
    .join(joiner)
    .trim();
}
