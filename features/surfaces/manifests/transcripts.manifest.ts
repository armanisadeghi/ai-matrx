/**
 * Surface manifest — Transcripts viewer (`matrx-user/transcripts`).
 *
 * The legacy read-only / lightly-editable transcript viewer at `/transcripts`.
 * One transcript is "active" at a time (owned by `TranscriptsContext`); the
 * user reads through speaker-labelled segments with timecodes, plays the
 * source audio, and (occasionally) edits segment text.
 *
 * What's different about this surface vs. Notes / PDF Widgets:
 *
 * - **Time anchor.** Audio playback is a first-class context — there's a
 *   live `currentTime` and a "segment under the cursor" concept. Agents
 *   wired to `current_segment_text` get the segment the user is currently
 *   hearing, without writing playback-aware code themselves.
 * - **Speaker dimension.** Each segment carries a `speaker` label. The
 *   manifest exposes both the per-segment speaker AND a `per_speaker_text`
 *   roll-up so agents like "summarize Speaker A's contributions" work
 *   without filtering in widget code.
 * - **Inline segments.** Segments live as a JSON array on the
 *   `transcripts.segments` column (not a separate table). The full segment
 *   list is therefore cheap to expose verbatim.
 *
 * Sister surface `matrx-user/transcript-studio` (live recording workspace
 * with cleaning/concept/module agent pipelines) is a separate manifest — its
 * data model is relational, time is session-relative, and it has three
 * existing agent integrations whose scope vocabulary must be preserved.
 * That manifest is intentionally NOT a child of this one.
 *
 * Canonical value groups (drives binding-editor + on-page chrome grouping):
 *
 *   transcript_identity — which transcript is open + its stored metadata
 *   playback            — the audio timeline: cursor segment + player state
 *   segments            — the body as structured segments / joined text
 *   speakers            — the speaker dimension
 *   editor_state        — what the user is acting on and which editor is open
 *
 * Runtime emitter: `useTranscriptsSurfaceScope` (TranscriptViewer) →
 * `buildTranscriptsContextData` → `createTranscriptsScope`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "transcript_identity",
    label: "Transcript identity",
    sortOrder: 100,
    description: "Which transcript is open and its stored metadata.",
  },
  {
    key: "playback",
    label: "Playback",
    sortOrder: 200,
    description:
      "The audio timeline: the segment under the playback cursor plus live player and media state.",
  },
  {
    key: "segments",
    label: "Segments",
    sortOrder: 300,
    description:
      "The transcript body as structured segments and as joined text.",
  },
  {
    key: "speakers",
    label: "Speakers",
    sortOrder: 400,
    description: "The speaker dimension rolled up across segments.",
  },
  {
    key: "editor_state",
    label: "Editor state",
    sortOrder: 500,
    description:
      "What the user is acting on right now and which editor (if any) is open.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Editor state / active focus ────────────────────────────────────────
  {
    name: "active_text",
    label: "Active text",
    description:
      "What the user is currently acting on: the highlighted browser selection if any, otherwise the segment under the playback cursor, otherwise the whole transcript as joined text. Empty when no transcript is open. Wire here for 'run on what the user is hearing right now' style actions.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 210,
    group: "editor_state",
  },
  {
    name: "active_scope_kind",
    label: "Active scope kind",
    description:
      '"selection" when text is highlighted, "segment" when a segment is under the playback cursor with no selection, "transcript" when a transcript is open but neither, "empty" when no transcript is open. Lets an agent reason about what `active_text` represents.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 220,
    group: "editor_state",
  },
  {
    name: "editor_mode",
    label: "Editor mode",
    description:
      '"view" when the user is reading, "edit-metadata" when the title/description editor is open, "edit-segments" when the inline transcript-body editor is open. Lets actions adapt or refuse based on what the user is currently doing.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 16,
    sortOrder: 430,
    group: "editor_state",
  },

  // ── Playback — cursor segment ──────────────────────────────────────────
  {
    name: "current_segment_id",
    label: "Current segment ID",
    description:
      "ID of the segment under the audio playback cursor (the segment whose `seconds` is the latest one less than or equal to `current_playback_time`). Empty when no transcript is open, playback hasn't started, or the cursor is before the first segment.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 230,
    group: "playback",
  },
  {
    name: "current_segment_text",
    label: "Current segment text",
    description:
      "Text of the segment under the playback cursor. Empty when no current segment. Wire here for transcript-actions that should operate on just the line being heard right now (e.g. 'rephrase this segment', 'translate this line').",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 235,
    group: "playback",
  },
  {
    name: "current_segment_speaker",
    label: "Current segment speaker",
    description:
      'Speaker label of the segment under the playback cursor (e.g. "Speaker A", "Host", a person\'s name). Empty when the segment has no speaker label or no current segment.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 240,
    group: "playback",
  },
  {
    name: "current_segment_start_seconds",
    label: "Current segment start (seconds)",
    description:
      "Numeric `seconds` field of the segment under the playback cursor. Useful for anchoring downstream tool calls back to the audio timeline.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 245,
    group: "playback",
  },
  {
    name: "current_segment_timecode",
    label: "Current segment timecode",
    description:
      'Formatted "MM:SS" (or "HH:MM:SS" past one hour) timecode of the current segment. Pre-formatted so agent output can quote it directly without re-formatting numeric seconds.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 250,
    group: "playback",
  },
  {
    name: "current_segment",
    label: "Current segment",
    description:
      "Composite object for the segment under the playback cursor: { id, text, speaker, seconds, timecode }. Mirrors the individual current_segment_* values as one group value (completeness law). Empty when no current segment.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 255,
    autoContext: false,
    group: "playback",
  },
  {
    name: "current_playback_time",
    label: "Current playback time (seconds)",
    description:
      "Live audio playback position in seconds, captured at trigger time. Zero when no audio is loaded or playback hasn't started.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 260,
    group: "playback",
  },

  // ── Transcript identity & metadata ─────────────────────────────────────
  {
    name: "transcript_id",
    label: "Active transcript ID",
    description:
      "UUID of the transcript the user has open. Empty when no transcript is selected. Required for any action that writes back to the row.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "transcript_identity",
  },
  {
    name: "transcript_title",
    label: "Active transcript title",
    description:
      "Human-readable title of the active transcript. Empty when no transcript is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 310,
    group: "transcript_identity",
  },
  {
    name: "transcript_description",
    label: "Active transcript description",
    description:
      "User-provided description for the active transcript. Empty when no description was set or no transcript is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 315,
    group: "transcript_identity",
  },
  {
    name: "transcript_source_type",
    label: "Active transcript source type",
    description:
      'Kind of source the transcript was produced from: "audio", "video", "meeting", "interview", or "other". Lets agent actions adapt their phrasing or refuse when the modality is wrong.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 320,
    group: "transcript_identity",
  },
  {
    name: "transcript_duration_seconds",
    label: "Active transcript duration (seconds)",
    description:
      "Total duration of the source media in seconds, when known. Read from `metadata.duration`. Zero when the transcript metadata doesn't carry a duration or no transcript is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 325,
    group: "transcript_identity",
  },
  {
    name: "transcript_recording_date",
    label: "Recording date",
    description:
      "ISO date the source was recorded, when the transcript metadata carries one (`metadata.recordingDate`). Empty when unknown or no transcript is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 326,
    group: "transcript_identity",
  },
  {
    name: "transcript_word_count",
    label: "Stored word count",
    description:
      "Word count stored on the transcript's metadata (`metadata.wordCount`), stamped at creation/import time. Empty when the metadata doesn't carry one or no transcript is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 327,
    group: "transcript_identity",
  },
  {
    name: "transcript_tags",
    label: "Active transcript tags",
    description:
      "Array of tag strings on the active transcript. Empty array when the transcript has no tags or no transcript is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 330,
    group: "transcript_identity",
  },
  {
    name: "transcript_folder",
    label: "Active transcript folder",
    description:
      "Free-text folder the active transcript belongs to (`folder_name`). Empty when uncategorized or no transcript is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 32,
    sortOrder: 335,
    group: "transcript_identity",
  },
  {
    name: "transcript_created_at",
    label: "Created at",
    description:
      "ISO timestamp the active transcript row was created. Empty when no transcript is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 340,
    autoContext: false,
    group: "transcript_identity",
  },
  {
    name: "transcript_updated_at",
    label: "Updated at",
    description:
      "ISO timestamp the active transcript row was last updated. Empty when no transcript is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 342,
    autoContext: false,
    group: "transcript_identity",
  },
  {
    name: "transcript_is_draft",
    label: "Is draft",
    description:
      "True when the active transcript is still a recording draft (`is_draft`), false once finalized. Empty when no transcript is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 344,
    group: "transcript_identity",
  },

  // ── Speakers ───────────────────────────────────────────────────────────
  {
    name: "speaker_list",
    label: "Speakers",
    description:
      'Array of distinct speaker labels (e.g. ["Host", "Guest", "Speaker A"]) in order of first appearance across the segments. Always populated — empty array when the transcript has no speaker labels or no transcript is open. Enables "for each speaker, do X" widgets.',
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 350,
    group: "speakers",
  },
  {
    name: "speaker_count",
    label: "Speaker count",
    description:
      "Number of distinct speaker labels across the segments. Always populated — 0 when the transcript has no speaker labels or no transcript is open.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 355,
    group: "speakers",
  },
  {
    name: "per_speaker_text",
    label: "Text grouped by speaker",
    description:
      'Object keyed by speaker label, whose values are that speaker\'s utterances joined by newlines (e.g. `{ "Speaker A": "line one\\nline two", "Speaker B": "..." }`). Empty object when no speakers are labelled or no transcript is open. Powers "summarize Speaker A\'s contributions" actions without per-speaker filtering in widget code.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 360,
    group: "speakers",
  },

  // ── Segments ───────────────────────────────────────────────────────────
  {
    name: "all_segments",
    label: "All segments",
    description:
      'Full array of segments as `[{ id, timecode, seconds, text, speaker }]` in playback order. Empty array when no transcript is open. Use when an agent needs structured access (e.g. "find the segment where the speaker says X") instead of joined text.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 370,
    group: "segments",
  },
  {
    name: "segment_count",
    label: "Segment count",
    description:
      "Number of segments in the active transcript. Always populated — 0 when no transcript is open.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 375,
    group: "segments",
  },
  {
    name: "all_segments_text",
    label: "All segments as text",
    description:
      "Joined transcript text — every segment's text concatenated with newlines and (where available) prefixed by `[timecode] Speaker:`. Empty when no transcript is open. The most common single-string handle when an agent should see the whole transcript.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    sortOrder: 380,
    group: "segments",
  },

  // ── Playback — media + player state ────────────────────────────────────
  {
    name: "audio_file_path",
    label: "Audio file path",
    description:
      "Canonical Files UUID for the source audio (`audio_file_path` column). Empty when the transcript has no associated audio or no transcript is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 400,
    group: "playback",
  },
  {
    name: "has_video",
    label: "Has video source",
    description:
      "True when the transcript has a `video_file_path`. Always populated. Lets agents decide whether visual-context tool calls are available.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 410,
    group: "playback",
  },
  {
    name: "video_file_path",
    label: "Video file path",
    description:
      "Canonical Files UUID for the source video (`video_file_path` column). Empty when the transcript has no associated video or no transcript is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 412,
    autoContext: false,
    group: "playback",
  },
  {
    name: "is_playing",
    label: "Audio is playing",
    description:
      "True when the audio player is currently playing (not paused, ended, or unloaded). Empty when no audio is loaded or no transcript is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 420,
    group: "playback",
  },
  {
    name: "playback_speed",
    label: "Playback speed",
    description:
      "Current audio playback speed multiplier (e.g. 0.75, 1, 1.25, 1.5, 2, 3). 1 means real-time. Empty when no audio is loaded or no transcript is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 425,
    group: "playback",
  },
  {
    name: "audio_duration_seconds",
    label: "Audio duration (seconds)",
    description:
      "Duration of the loaded audio as reported by the player element — the live media truth, distinct from the stored `transcript_duration_seconds` metadata. Empty until the audio's metadata has loaded or when no audio exists.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 427,
    group: "playback",
  },
  {
    name: "playback_volume",
    label: "Playback volume",
    description:
      "Audio player volume from 0 to 1. Empty when no audio is loaded or no transcript is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 428,
    autoContext: false,
    group: "playback",
  },
  {
    name: "playback_state",
    label: "Playback state",
    description:
      "Composite player snapshot: { is_playing, current_time, playback_speed, volume, duration }. Mirrors the individual player values as one group value (completeness law). Empty when no transcript is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 440,
    autoContext: false,
    group: "playback",
  },
];

export const transcriptsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/transcripts",
  readiness: "verified",
  label: "Transcripts",
  groups,
  values: mergeBaselineValues(
    // Baseline:
    //   `selection` — browser text selection on the rendered segments. Lazily
    //     populated by the launcher when a context menu is opened with a
    //     window selection; otherwise empty.
    //   `content`   — back-compat alias of `all_segments_text` (full joined
    //     transcript). Kept so legacy shortcuts wired to `content` still work.
    //   `context`   — escape hatch for surface-shaped extras.
    //   `text_before` / `text_after` are intentionally NOT picked: the viewer
    //   is read-only at the text level — there's no "editable region around
    //   a cursor" concept for those values to meaningfully describe.
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

/** Composite segment entry emitted as `current_segment`. */
export interface TranscriptCurrentSegmentValue {
  id: string;
  text: string;
  speaker?: string;
  seconds: number;
  timecode: string;
}

/** Composite player snapshot emitted as `playback_state`. */
export interface TranscriptPlaybackStateValue {
  is_playing: boolean;
  current_time: number;
  playback_speed: number;
  volume?: number;
  duration?: number;
}

/**
 * Type-safe payload helper. The Transcripts viewer calls this when emitting
 * its surface scope so TypeScript catches missing required keys and unknown
 * keys at the callsite.
 *
 * Required keys (no `?`) mirror every value declared `alwaysAvailable: true`
 * in the manifest above; optional keys (`?`) mirror `alwaysAvailable: false`.
 */
export function createTranscriptsScope(values: {
  // alwaysAvailable: true → required
  active_scope_kind: "selection" | "segment" | "transcript" | "empty";
  speaker_list: string[];
  speaker_count: number;
  segment_count: number;
  has_video: boolean;
  editor_mode: "view" | "edit-metadata" | "edit-segments";
  // alwaysAvailable: false → optional
  selection?: string;
  content?: string;
  context?: Record<string, unknown> | string;
  active_text?: string;
  current_segment_id?: string;
  current_segment_text?: string;
  current_segment_speaker?: string;
  current_segment_start_seconds?: number;
  current_segment_timecode?: string;
  current_segment?: TranscriptCurrentSegmentValue;
  current_playback_time?: number;
  transcript_id?: string;
  transcript_title?: string;
  transcript_description?: string;
  transcript_source_type?: string;
  transcript_duration_seconds?: number;
  transcript_recording_date?: string;
  transcript_word_count?: number;
  transcript_tags?: string[];
  transcript_folder?: string;
  transcript_created_at?: string;
  transcript_updated_at?: string;
  transcript_is_draft?: boolean;
  per_speaker_text?: Record<string, string>;
  all_segments?: Array<{
    id: string;
    timecode: string;
    seconds: number;
    text: string;
    speaker?: string;
  }>;
  all_segments_text?: string;
  audio_file_path?: string;
  video_file_path?: string;
  is_playing?: boolean;
  playback_speed?: number;
  audio_duration_seconds?: number;
  playback_volume?: number;
  playback_state?: TranscriptPlaybackStateValue;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
