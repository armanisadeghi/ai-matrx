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
 * Sort order groups (drives binding-editor grouping):
 *
 *   100-200   Baseline (selection, content, context)
 *   210-260   Selection / segment / playback mirror
 *   300-349   Transcript identity & metadata
 *   350-369   Speaker dimension
 *   370-389   Segments dimension
 *   400-449   Media + editor state
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Selection / segment / playback mirror (210-260) ───────────────────
  {
    name: "active_text",
    label: "Active text",
    description:
      "What the user is currently acting on: the highlighted browser selection if any, otherwise the segment under the playback cursor, otherwise the whole transcript as joined text. Empty when no transcript is open. Wire here for 'run on what the user is hearing right now' style actions.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 210,
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
  },
  {
    name: "current_segment_id",
    label: "Current segment ID",
    description:
      "ID of the segment under the audio playback cursor (the segment whose `seconds` is the latest one less than or equal to `current_playback_time`). Empty when no transcript is open, playback hasn't started, or the cursor is before the first segment.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 230,
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
  },

  // ── Transcript identity & metadata (300-349) ──────────────────────────
  {
    name: "transcript_id",
    label: "Active transcript ID",
    description:
      "UUID of the transcript the user has open. Empty when no transcript is selected. Required for any action that writes back to the row.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
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
  },

  // ── Speaker dimension (350-369) ───────────────────────────────────────
  {
    name: "speaker_list",
    label: "Speakers",
    description:
      'Array of distinct speaker labels (e.g. ["Host", "Guest", "Speaker A"]) in order of first appearance across the segments. Always populated — empty array when the transcript has no speaker labels or no transcript is open. Enables "for each speaker, do X" widgets.',
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 350,
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
  },

  // ── Segments dimension (370-389) ──────────────────────────────────────
  {
    name: "all_segments",
    label: "All segments",
    description:
      'Full array of segments as `[{ id, timecode, seconds, text, speaker }]` in playback order. Empty array when no transcript is open. Use when an agent needs structured access (e.g. "find the segment where the speaker says X") instead of joined text.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 370,
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
  },

  // ── Media + editor state (400-449) ────────────────────────────────────
  {
    name: "audio_file_path",
    label: "Audio file path",
    description:
      "Supabase storage path of the source audio file (`audio_file_path` column). Empty when the transcript has no associated audio (e.g. pasted text source) or no transcript is open. Tool calls that need the original audio can use this to fetch a signed URL.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 400,
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
  },
  {
    name: "editor_mode",
    label: "Editor mode",
    description:
      '"view" when the user is reading, "edit-metadata" when the title/description editor is open, "edit-segments" reserved for future inline segment editing. Lets actions adapt or refuse based on what the user is currently doing.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 16,
    sortOrder: 430,
  },
];

export const transcriptsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/transcripts",
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
  current_playback_time?: number;
  transcript_id?: string;
  transcript_title?: string;
  transcript_description?: string;
  transcript_source_type?: string;
  transcript_duration_seconds?: number;
  transcript_tags?: string[];
  transcript_folder?: string;
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
  is_playing?: boolean;
  playback_speed?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
