// features/transcript-studio/format.ts
//
// Shared HUMAN summaries + agent-payload projections for the Transcript Studio
// surfaces (agent-copy rollout), plus the PURE shortening builder for a studio
// column's segment stream.
//
// Studio segments are time-ranged (`tStart`/`tEnd` seconds) rather than
// display-timecoded like `transcripts.segments`, so they get their own line
// renderer. The SHORTENING SHAPE is deliberately the same as
// `features/transcripts/format.ts` — same levers, same honest omission stub —
// so a user who learns the composer on a finished transcript finds the same
// controls on a live session.

import { humanLines } from "@/features/marketing/lib/copy-payloads";
import type {
  CleanedSegment,
  RawSegment,
  StudioSession,
} from "@/features/transcript-studio/types";

/** Route + surface string stamped into every studio payload's envelope. */
export function studioLocation(surface: string): string {
  return `AI Matrx — Transcript Studio — ${surface}`;
}

export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

// ── Session rows ────────────────────────────────────────────────────────────

export function sessionDisplayTitle(
  s: { title?: string | null } | null | undefined,
): string {
  const title = s?.title?.trim();
  return title && title.length > 0 ? title : "Untitled session";
}

export function sessionSummary(session: StudioSession): string {
  return humanLines([
    ["Session", sessionDisplayTitle(session)],
    ["Status", session.status],
    ["Source", session.source],
    ["Module", session.moduleId],
    ["Duration", formatSeconds(session.totalDurationMs / 1000)],
    ["Started", session.startedAt],
    ["Ended", session.endedAt],
    ["Transcript id", session.transcriptId],
    ["Id", session.id],
  ]);
}

export function sessionData(session: StudioSession) {
  return {
    id: session.id,
    title: sessionDisplayTitle(session),
    status: session.status,
    source: session.source,
    module_id: session.moduleId,
    total_duration_ms: session.totalDurationMs,
    started_at: session.startedAt,
    ended_at: session.endedAt,
    transcript_id: session.transcriptId,
    organization_id: session.organizationId,
    project_id: session.projectId,
    segments_included: false as const,
  };
}

export function sessionKeyFields(session: StudioSession) {
  return {
    title: sessionDisplayTitle(session),
    status: session.status,
    source: session.source,
    duration: formatSeconds(session.totalDurationMs / 1000),
    started_at: session.startedAt,
  };
}

export function sessionsListSummary(
  sessions: StudioSession[],
  ctx: { surface: string; total?: number; filter?: string },
): string {
  const header = humanLines([
    ["Sessions", ctx.surface],
    ["Shown", sessions.length],
    [
      "Total",
      ctx.total !== undefined && ctx.total !== sessions.length
        ? ctx.total
        : null,
    ],
    ["Filter", ctx.filter?.trim() || null],
  ]);
  if (sessions.length === 0) return `${header}\n\n(no sessions)`;
  return `${header}\n\n${sessions.map(sessionSummary).join("\n\n")}`;
}

export function sessionsCsvRows(
  sessions: StudioSession[],
): Array<Record<string, unknown>> {
  return sessions.map((s) => ({
    id: s.id,
    title: sessionDisplayTitle(s),
    status: s.status,
    source: s.source,
    module_id: s.moduleId,
    duration_seconds: Math.round(s.totalDurationMs / 1000),
    started_at: s.startedAt,
    ended_at: s.endedAt ?? "",
  }));
}

// ── Column segments ─────────────────────────────────────────────────────────

type StudioSegment = Pick<RawSegment, "tStart" | "tEnd" | "text"> & {
  speaker?: string | null;
};

/** One studio segment as the column renders it: "[0:12] Speaker: text". */
export function studioSegmentLine(
  segment: StudioSegment,
  opts: { timestamps?: boolean; speakers?: boolean } = {},
): string {
  const parts: string[] = [];
  if (opts.timestamps !== false) parts.push(`[${formatSeconds(segment.tStart)}]`);
  if (opts.speakers !== false && segment.speaker?.trim()) {
    parts.push(`${segment.speaker.trim()}:`);
  }
  parts.push(segment.text ?? "");
  return parts.join(" ").trim();
}

export function studioSegmentData(segment: RawSegment | CleanedSegment) {
  return {
    id: segment.id,
    t_start: segment.tStart,
    t_end: segment.tEnd,
    text: segment.text,
    speaker: "speaker" in segment ? segment.speaker : null,
    source: "source" in segment ? segment.source : null,
    pass_index: "passIndex" in segment ? segment.passIndex : null,
  };
}

export interface StudioShortenResult {
  text: string;
  segments_included: number;
  segments_total: number;
  segments_omitted: number;
  chars: number;
  truncated_segments: number;
}

/**
 * Shorten a studio column's segment stream. Pure — no React.
 *
 * Same contract as `shortenTranscript`: when leading segments are dropped the
 * output SAYS how many and over what time range, so an agent never mistakes
 * the tail for the whole session.
 */
export function shortenStudioSegments(
  segments: StudioSegment[],
  opts: {
    lastN?: number;
    timestamps?: boolean;
    speakers?: boolean;
    charCap?: number;
  } = {},
): StudioShortenResult {
  const all = segments ?? [];
  const lastN = opts.lastN && opts.lastN > 0 ? opts.lastN : 0;
  const kept = lastN > 0 && all.length > lastN ? all.slice(-lastN) : all;
  const omitted = all.length - kept.length;
  const charCap = opts.charCap && opts.charCap > 0 ? opts.charCap : 0;

  let truncatedSegments = 0;
  const lines = kept.map((segment) => {
    let line = studioSegmentLine(segment, {
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
      ? `[${omitted} earlier chunk${omitted === 1 ? "" : "s"} omitted — covering ${formatSeconds(
          all[0]?.tStart,
        )} to ${formatSeconds(kept[0]?.tStart)}]`
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
