/**
 * `transcript_legacy_text` — the named parser strategy behind the
 * ```transcript fence surface (kind_surface: fence_lang/transcript →
 * transcript).
 *
 * WRAPS the one existing legacy text parser — `parseTranscript`, the exact
 * code TranscriptBlock renders fence bodies through today (timecoded
 * `[MM:SS]` / `[HH:MM:SS]` lines, `**MM:SS - MM:SS**` ranges, bold
 * `**Speaker:**` lines, leading `#`/`**…**` title + `##`/`###` subtitle
 * headers, boilerplate "Audio Transcription" labels skipped). It NEVER
 * re-implements that grammar; it only maps the parser's output onto the
 * canonical transcript value, so the fence surface converges to the SAME
 * shape a `__kind` JSON arrival carries (THE KEYSTONE).
 *
 * NOTE: the host fence-finalize hook does not exist yet (xml-finalize.ts is
 * XML-only today). This strategy is host-ready: it accepts BOTH framings —
 * a full fenced region (```transcript … ```) and the inner-only body — the
 * same tolerance the flashcards XML strategy has for its two hosts. The
 * central integration pass wires the name `transcript_legacy_text` to this
 * function at the fence-finalize seam.
 *
 * Null (parse produced no segment) means parse failure: the caller treats it
 * loudly and leaves legacy rendering untouched.
 */

import { parseTranscript } from "@/components/mardown-display/blocks/transcripts/transcript-parser";
import { KIND_KEY } from "../core/kind-schema.types";

/** Opening fence line, e.g. ```transcript (optional info suffix) — host framing. */
const OPENING_FENCE_RE = /^\s*```transcript[^\n]*\n?/i;
/** Trailing closing fence on its own line. */
const CLOSING_FENCE_RE = /\n?\s*```\s*$/;

/**
 * Completed ```transcript region text → canonical transcript value, or null
 * when the region yields no segment. `title`/`subtitle` are included only
 * when the parser found one (the schema marks both nullable+optional);
 * segments carry the parser's own id/timecode/seconds conventions verbatim
 * (deterministic, so both hosts fingerprint identically), and `speaker` only
 * when the line had one — annotation lines ("[Sound of paper shuffling]")
 * stay speakerless text, exactly as the parser emits them.
 */
export function transcriptLegacyTextToKindValue(
  regionText: string,
): Record<string, unknown> | null {
  let inner = regionText.replace(OPENING_FENCE_RE, "");
  inner = inner.replace(CLOSING_FENCE_RE, "");

  const parsed = parseTranscript(inner);
  if (parsed.segments.length === 0) return null;

  const value: Record<string, unknown> = {
    [KIND_KEY]: "transcript",
    segments: parsed.segments.map((segment) => {
      const mapped: Record<string, unknown> = {
        [KIND_KEY]: "transcript_segment",
        id: segment.id,
        timecode: segment.timecode,
        seconds: segment.seconds,
        text: segment.text,
      };
      if (segment.speaker !== undefined) mapped.speaker = segment.speaker;
      return mapped;
    }),
  };
  if (parsed.title !== null) value.title = parsed.title;
  if (parsed.subtitle !== null) value.subtitle = parsed.subtitle;

  return value;
}
