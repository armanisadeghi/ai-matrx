// features/transcripts/format.ts
//
// Shared HUMAN summaries + agent-payload projections for the transcripts
// surfaces (agent-copy rollout), plus the PURE transcript shortening builder
// that backs the custom-composer dialog.
//
// The shortening logic lives here, not in the chrome and not inline at a
// callsite: a long transcript is the one shape in this cluster with real
// levers (how many segments, timestamps on/off, speaker labels on/off, a
// per-segment char cap), and any AI feature must be able to call the same
// builder with no clicking.

import { humanLines } from "@/features/marketing/lib/copy-payloads";
import type { Transcript, TranscriptSegment } from "@/features/transcripts/types";

/** Route + surface string stamped into every transcripts payload's envelope. */
export function transcriptLocation(surface: string): string {
  return `AI Matrx — Transcripts — ${surface}`;
}

export function transcriptDisplayTitle(
  t: { title?: string | null } | null | undefined,
): string {
  const title = t?.title?.trim();
  return title && title.length > 0 ? title : "Untitled transcript";
}

function formatDuration(seconds: number | undefined | null): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

// ── Segments ────────────────────────────────────────────────────────────────

/** One segment as the viewer renders it: "[00:01:23] Speaker: text". */
export function segmentLine(
  segment: TranscriptSegment,
  opts: { timestamps?: boolean; speakers?: boolean } = {},
): string {
  const parts: string[] = [];
  if (opts.timestamps !== false && segment.timecode) {
    parts.push(`[${segment.timecode}]`);
  }
  if (opts.speakers !== false && segment.speaker?.trim()) {
    parts.push(`${segment.speaker.trim()}:`);
  }
  parts.push(segment.text ?? "");
  return parts.join(" ").trim();
}

export function segmentSummary(segment: TranscriptSegment): string {
  return humanLines([
    ["Timecode", segment.timecode],
    ["Seconds", segment.seconds],
    ["Speaker", segment.speaker],
    ["Text", segment.text],
  ]);
}

export function segmentData(segment: TranscriptSegment) {
  return {
    id: segment.id,
    timecode: segment.timecode,
    seconds: segment.seconds,
    speaker: segment.speaker ?? null,
    text: segment.text,
  };
}

// ── The transcript record ───────────────────────────────────────────────────

/** The rendered transcript body — the same join the viewer's own copy uses. */
export function transcriptBody(
  segments: TranscriptSegment[],
  opts: { timestamps?: boolean; speakers?: boolean } = {},
): string {
  return segments.map((s) => segmentLine(s, opts)).join("\n\n");
}

export function transcriptHeaderSummary(t: Transcript): string {
  const speakers = t.metadata?.speakers ?? [];
  return humanLines([
    ["Transcript", transcriptDisplayTitle(t)],
    ["Description", t.description],
    ["Source", t.source_type],
    ["Folder", t.folder_name],
    ["Tags", (t.tags ?? []).join(", ")],
    ["Segments", t.segments?.length ?? 0],
    ["Duration", formatDuration(t.metadata?.duration)],
    ["Words", t.metadata?.wordCount],
    ["Speakers", Array.isArray(speakers) ? speakers.join(", ") : null],
    ["Draft", t.is_draft ? "yes" : null],
    ["Updated", t.updated_at],
    ["Id", t.id],
  ]);
}

/** Human summary of the whole transcript — header, then the rendered body. */
export function transcriptSummary(t: Transcript): string {
  return `${transcriptHeaderSummary(t)}\n\n--- Transcript ---\n${transcriptBody(
    t.segments ?? [],
  )}`;
}

/** Agent projection of the record WITHOUT segments (the header/metadata half). */
export function transcriptMetaData(t: Transcript) {
  return {
    id: t.id,
    title: transcriptDisplayTitle(t),
    description: t.description ?? null,
    source_type: t.source_type,
    folder_name: t.folder_name ?? null,
    tags: t.tags ?? [],
    is_draft: t.is_draft,
    segment_count: t.segments?.length ?? 0,
    duration_seconds: t.metadata?.duration ?? null,
    word_count: t.metadata?.wordCount ?? null,
    speakers: t.metadata?.speakers ?? [],
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

/** Agent projection of the full record, segments included. */
export function transcriptData(t: Transcript) {
  return {
    ...transcriptMetaData(t),
    segments: (t.segments ?? []).map(segmentData),
  };
}

// ── The pure shortening builder (backs the aiCustom composer) ───────────────

export interface TranscriptShortenOptions {
  /** Keep only the last N segments. 0 = all. */
  lastN?: number;
  /** Include `[timecode]` prefixes. */
  timestamps?: boolean;
  /** Include `Speaker:` prefixes. */
  speakers?: boolean;
  /** Truncate each segment's text to this many chars. 0 = unlimited. */
  charCap?: number;
}

export interface TranscriptShortenResult {
  text: string;
  segments_included: number;
  segments_total: number;
  segments_omitted: number;
  chars: number;
  truncated_segments: number;
}

/**
 * Shorten a transcript to the caller's options. Pure — no React, no clicking.
 *
 * A stub is honest: when leading segments are dropped, the output SAYS how
 * many were omitted and over what time range, so the agent knows to ask for
 * the rest instead of assuming the conversation started where the text does.
 */
export function shortenTranscript(
  segments: TranscriptSegment[],
  opts: TranscriptShortenOptions = {},
): TranscriptShortenResult {
  const all = segments ?? [];
  const lastN = opts.lastN && opts.lastN > 0 ? opts.lastN : 0;
  const kept = lastN > 0 && all.length > lastN ? all.slice(-lastN) : all;
  const omitted = all.length - kept.length;
  const charCap = opts.charCap && opts.charCap > 0 ? opts.charCap : 0;

  let truncatedSegments = 0;
  const lines = kept.map((segment) => {
    let line = segmentLine(segment, {
      timestamps: opts.timestamps,
      speakers: opts.speakers,
    });
    if (charCap > 0 && line.length > charCap) {
      truncatedSegments += 1;
      line = `${line.slice(0, charCap)}… [+${line.length - charCap} chars]`;
    }
    return line;
  });

  const stub =
    omitted > 0
      ? `[${omitted} earlier segment${omitted === 1 ? "" : "s"} omitted` +
        (all[0]?.timecode && kept[0]?.timecode
          ? ` — covering ${all[0].timecode} to ${kept[0].timecode}]`
          : "]")
      : null;

  const text = [stub, ...lines].filter(Boolean).join("\n\n");
  return {
    text,
    segments_included: kept.length,
    segments_total: all.length,
    segments_omitted: omitted,
    chars: text.length,
    truncated_segments: truncatedSegments,
  };
}

// ── Hub list rows (the /transcripts entity list) ────────────────────────────

/**
 * Human summary of one hub row. The hub is heterogeneous (transcript |
 * session | cleanup | unsorted), so the row's `kind` leads — a payload that
 * dropped it would make four different records look like one type.
 */
export function transcriptRowSummary(row: {
  kind: string;
  title: string | null;
  updated_at?: string | null;
  duration_seconds?: number | null;
  word_count?: number | null;
  scope?: string | null;
  id: string;
}): string {
  return humanLines([
    ["Kind", row.kind],
    ["Title", row.title || "Untitled"],
    ["Duration", formatDuration(row.duration_seconds)],
    ["Words", row.word_count],
    ["Scope", row.scope],
    ["Updated", row.updated_at],
    ["Id", row.id],
  ]);
}
