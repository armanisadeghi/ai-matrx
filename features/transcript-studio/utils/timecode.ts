/**
 * Canonical session-time formatting for the studio / scribe.
 *
 * `formatTimecode` renders seconds-from-session-start as `m:ss` (or `h:mm:ss`
 * past an hour) — the ONE timecode format every transcript surface shows, so a
 * segment reads identically wherever it's displayed or copied. Previously
 * duplicated inline in RawTranscriptColumn + CleanedTranscriptColumn; this is
 * the single source of truth.
 */

export function formatTimecode(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return `${m}:${s.toString().padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${mm.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Build the standard timestamped transcript text from time-anchored segments:
 * one `[m:ss] text` entry per segment. This is the single standard for any
 * human-facing transcript DISPLAY or copy/export across the app (the plain,
 * un-timecoded selectors remain for machine consumers — agent context, RAG,
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
