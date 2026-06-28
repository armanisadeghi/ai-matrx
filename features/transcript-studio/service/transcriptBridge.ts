/**
 * Bidirectional bridge between `features/transcripts/` and the transcript
 * studio. Single source of truth for the conversion rules — both directions
 * live here so they don't drift.
 *
 * Promote (transcripts → studio):
 *   - Insert a `studio_sessions` row with `transcript_id = source.id`,
 *     default settings, status='stopped', module_id='tasks'.
 *   - Migrate `transcripts.segments` JSONB into `studio_raw_segments` rows
 *     in a single batch insert. Each segment becomes one raw row using
 *     its existing `seconds` for `t_start`; `t_end` is synthesized from
 *     the next segment's `seconds` (or `+10s` for the last).
 *   - Source = "imported" so future cleanup passes don't try to attach
 *     them to a recording_segment.
 *
 * Save as transcript (studio → transcripts):
 *   - Materialize a `transcripts` row from the studio session's title +
 *     audio_storage_path + raw segments. Use the FIRST cleaned segments
 *     where they exist (higher signal); fall back to raw text otherwise.
 *   - Set `studio_sessions.transcript_id` to the new transcript id so the
 *     studio session and the transcript record cross-reference each other.
 *
 * Both operations are best-effort idempotent:
 *   - Promote checks the source isn't already promoted (returns the
 *     existing studio session in that case).
 *   - Save-as overwrites the linked transcript's segments rather than
 *     creating duplicates when one already exists.
 */

import {
  createTranscript,
  fetchTranscriptById,
  updateTranscript,
} from "@/features/transcripts/service/transcriptsService";
import type {
  Transcript,
  TranscriptSegment,
} from "@/features/transcripts/types";
import {
  fetchSessionSettings,
  getSession,
  insertRawSegment,
  listRawSegments,
  upsertSessionSettings,
  updateSession,
} from "./studioService";
import { supabase } from "@/utils/supabase/client";
import {
  DEFAULT_MODULE_ID,
  NEW_SESSION_DEFAULT_TITLE,
} from "../constants";
import type {
  RawSegment,
  StudioSession,
} from "../types";

type LooseSupabase = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: (schema: string) => { from: (table: string) => any };
};
const db = supabase as unknown as LooseSupabase;

// ── Helpers ──────────────────────────────────────────────────────────

function secondsToTimecode(sec: number): string {
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
 * Find the existing studio session for a transcript, if any. We look up
 * the most-recently-updated active session — there should be only one in
 * normal operation, but the lookup tolerates orphans.
 */
async function findStudioSessionByTranscriptId(
  transcriptId: string,
): Promise<StudioSession | null> {
  const { data, error } = await db
    .schema("transcripts")
    .from("studio_sessions")
    .select("*")
    .eq("transcript_id", transcriptId)
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(
      `[studio-bridge] findStudioSessionByTranscriptId failed: ${error.message}`,
    );
  }
  if (!data || data.length === 0) return null;
  // We don't have rowToSession exported from studioService; we shape the
  // partial we need here (id only — caller refetches via getSession when
  // they need the full record).
  return { id: (data[0] as { id: string }).id } as StudioSession;
}

// ── Promote: transcripts → studio ────────────────────────────────────

export interface PromoteToStudioInput {
  transcript: Transcript;
  /** auth.users.id of the caller (passed in to skip a re-fetch). */
  userId: string;
}

export interface PromoteToStudioResult {
  /** The newly-created (or pre-existing) studio session id. */
  sessionId: string;
  /** Number of raw segments migrated. */
  rawSegmentCount: number;
  /** True if the source was already promoted previously. */
  alreadyPromoted: boolean;
}

export async function promoteTranscriptToStudio(
  input: PromoteToStudioInput,
): Promise<PromoteToStudioResult> {
  const { transcript, userId } = input;

  // Idempotence: bail with the existing session if already promoted.
  const existing = await findStudioSessionByTranscriptId(transcript.id);
  if (existing) {
    const segments = await listRawSegments(existing.id);
    return {
      sessionId: existing.id,
      rawSegmentCount: segments.length,
      alreadyPromoted: true,
    };
  }

  // 1. Create the parent studio_sessions row.
  const { data: sessionRow, error: sessionError } = await db
    .schema("transcripts")
    .from("studio_sessions")
    .insert({
      user_id: userId,
      transcript_id: transcript.id,
      title: transcript.title || NEW_SESSION_DEFAULT_TITLE,
      module_id: DEFAULT_MODULE_ID,
      status: "stopped",
      started_at: transcript.created_at,
      ended_at: transcript.updated_at,
      audio_storage_path: transcript.audio_file_path ?? null,
      total_duration_ms:
        typeof transcript.metadata?.duration === "number"
          ? Math.round(transcript.metadata.duration * 1000)
          : 0,
    })
    .select("id")
    .single();
  if (sessionError || !sessionRow) {
    throw new Error(
      `[studio-bridge] failed to create studio_sessions: ${sessionError?.message ?? "no row"}`,
    );
  }
  const sessionId = (sessionRow as { id: string }).id;

  // 2. Migrate segments.
  const segs = transcript.segments ?? [];
  if (segs.length > 0) {
    const rows = segs.map((seg, i) => {
      const tStart =
        typeof seg.seconds === "number" && Number.isFinite(seg.seconds)
          ? seg.seconds
          : 0;
      // tEnd = next.seconds if available; otherwise extend by 10s.
      const next = segs[i + 1];
      const tEnd =
        next && typeof next.seconds === "number" && Number.isFinite(next.seconds)
          ? next.seconds
          : tStart + 10;
      return {
        session_id: sessionId,
        chunk_index: i,
        t_start: tStart,
        t_end: tEnd,
        text: seg.text ?? "",
        speaker: seg.speaker ?? null,
        source: "imported",
      };
    });
    const { error: rawError } = await db
      .schema("transcripts")
      .from("studio_raw_segments")
      .insert(rows);
    if (rawError) {
      throw new Error(
        `[studio-bridge] failed to migrate raw segments: ${rawError.message}`,
      );
    }
  }

  return {
    sessionId,
    rawSegmentCount: segs.length,
    alreadyPromoted: false,
  };
}

// ── Save as transcript: studio → transcripts ─────────────────────────

export interface SaveAsTranscriptInput {
  /** The studio session to materialize. The caller fetches this. */
  session: StudioSession;
  /** Optional override of the new transcript's title. */
  title?: string;
  /** Optional folder for the new transcript. */
  folderName?: string;
}

export interface SaveAsTranscriptResult {
  transcriptId: string;
  /** True when we updated an existing linked transcript instead of creating one. */
  updatedExisting: boolean;
  segmentCount: number;
}

export async function saveStudioAsTranscript(
  input: SaveAsTranscriptInput,
): Promise<SaveAsTranscriptResult> {
  const { session, title, folderName } = input;

  // Build segments from raw segments, preferring cleaned text where it
  // covers a raw segment's range.
  const rawSegments = await listRawSegments(session.id);
  const cleanedSegments = await fetchActiveCleanedSegments(session.id);

  const segments: TranscriptSegment[] = rawSegments.map((raw) => {
    const cleaned = findCleanedFor(raw, cleanedSegments);
    return {
      id: raw.id,
      timecode: secondsToTimecode(raw.tStart),
      seconds: raw.tStart,
      text: cleaned ?? raw.text,
      ...(raw.speaker ? { speaker: raw.speaker } : {}),
    };
  });

  const totalDurationSec =
    rawSegments.length > 0
      ? rawSegments[rawSegments.length - 1]!.tEnd
      : 0;

  const sessionSettings = await fetchSessionSettings(session.id);

  const transcriptPayload = {
    title: title || session.title,
    segments,
    audio_file_path: session.audioStoragePath ?? null,
    source_type: "audio" as const,
    folder_name: folderName ?? "Studio Sessions",
    metadata: {
      duration: totalDurationSec,
      wordCount: segments.reduce(
        (sum, s) => sum + (s.text.split(/\s+/).filter(Boolean).length ?? 0),
        0,
      ),
      segmentCount: segments.length,
      studioSessionId: session.id,
      studioModuleId: sessionSettings?.moduleId ?? session.moduleId,
    },
    tags: ["studio"],
  };

  // If the session is already linked to a transcript, update that one.
  if (session.transcriptId) {
    let existing: Transcript | null = null;
    try {
      existing = await fetchTranscriptById(session.transcriptId);
    } catch {
      existing = null;
    }
    if (existing) {
      const updated = await updateTranscript(existing.id, {
        title: transcriptPayload.title,
        segments: transcriptPayload.segments,
        audio_file_path: transcriptPayload.audio_file_path,
        source_type: transcriptPayload.source_type,
        folder_name: transcriptPayload.folder_name,
        metadata: transcriptPayload.metadata,
        tags: transcriptPayload.tags,
      });
      return {
        transcriptId: updated.id,
        updatedExisting: true,
        segmentCount: segments.length,
      };
    }
  }

  // Otherwise, create a new transcript and back-link from the studio session.
  const created = await createTranscript(transcriptPayload);
  await updateSession(session.id, { transcriptId: created.id });
  // Refresh local state — caller dispatches `sessionUpserted` after this.
  void getSession; // referenced for callers that want the latest row
  void upsertSessionSettings;

  return {
    transcriptId: created.id,
    updatedExisting: false,
    segmentCount: segments.length,
  };
}

// ── Internals ────────────────────────────────────────────────────────

/**
 * Find a cleaned segment whose [tStart, tEnd] overlaps the raw segment.
 * Returns the cleaned text when one is found, else null.
 *
 * Cleaned segments are wider than raw chunks (one cleanup pass spans
 * multiple raw chunks). When two cleaned segments overlap a raw chunk,
 * we pick the one whose tStart is closest to the raw's tStart.
 */
function findCleanedFor(
  raw: RawSegment,
  cleaned: { tStart: number; tEnd: number; text: string }[],
): string | null {
  let best: { text: string; gap: number } | null = null;
  for (const c of cleaned) {
    if (c.tEnd < raw.tStart || c.tStart > raw.tEnd) continue;
    const gap = Math.abs(c.tStart - raw.tStart);
    if (!best || gap < best.gap) best = { text: c.text, gap };
  }
  return best?.text ?? null;
}

async function fetchActiveCleanedSegments(
  sessionId: string,
): Promise<{ tStart: number; tEnd: number; text: string }[]> {
  const { data, error } = await db
    .schema("transcripts")
    .from("studio_cleaned_segments")
    .select("t_start, t_end, text")
    .eq("session_id", sessionId)
    .is("superseded_at", null)
    .order("t_start", { ascending: true });
  if (error) {
    throw new Error(
      `[studio-bridge] failed to fetch cleaned segments: ${error.message}`,
    );
  }
  return (
    (data as { t_start: number | string; t_end: number | string; text: string }[]) ?? []
  ).map((r) => ({
    tStart: typeof r.t_start === "string" ? Number(r.t_start) : r.t_start,
    tEnd: typeof r.t_end === "string" ? Number(r.t_end) : r.t_end,
    text: r.text,
  }));
}

void insertRawSegment; // imported for type completeness; not called here