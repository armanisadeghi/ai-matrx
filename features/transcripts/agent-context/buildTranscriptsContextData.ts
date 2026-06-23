import type { PlacementMode } from "@/features/context-menu-v2/UnifiedAgentContextMenu";
import { createTranscriptsScope } from "@/features/surfaces/manifests/transcripts.manifest";
import type { Transcript, TranscriptSegment } from "@/features/transcripts/types";

/**
 * Placement visibility for the transcripts surface menu.
 *
 * The viewer is read-only at the text level, so the editor-only `content-block`
 * placement (insert a template at the cursor) is hidden; everything else —
 * AI actions, bound agents, org/user tools, quick actions — stays available so
 * the user can act on the displayed transcript. Modeled as `placementMode`
 * (the modern API) rather than the deprecated `enabledPlacements` so org/user
 * tools remain visible (the prior viewer behavior).
 */
export const TRANSCRIPTS_CONTEXT_MENU_PLACEMENT_MODE: PlacementMode = {
  "ai-action": "show",
  "bound-agent": "show",
  "content-block": "hide",
  "organization-tool": "show",
  "user-tool": "show",
  "quick-action": "show",
};

/** Shared menu props for `matrx-user/transcripts` (presentational + editable). */
export const TRANSCRIPTS_CONTEXT_MENU_PROPS = {
  sourceFeature: "transcripts" as const,
  surfaceName: "matrx-user/transcripts" as const,
  placementMode: TRANSCRIPTS_CONTEXT_MENU_PLACEMENT_MODE,
};

function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Segment whose [seconds, nextSeconds) bracket contains `currentTime`. */
function findCurrentSegment(
  segments: readonly TranscriptSegment[],
  currentTime: number,
): TranscriptSegment | null {
  if (!segments.length || currentTime < 0) return null;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const next = segments[i + 1];
    if (currentTime >= seg.seconds && (!next || currentTime < next.seconds)) {
      return seg;
    }
  }
  return null;
}

function buildSpeakerData(segments: readonly TranscriptSegment[]): {
  speakerList: string[];
  perSpeakerText: Record<string, string>;
} {
  const speakerList: string[] = [];
  const perSpeaker = new Map<string, string[]>();
  for (const seg of segments) {
    const label = seg.speaker?.trim();
    if (!label) continue;
    if (!perSpeaker.has(label)) {
      speakerList.push(label);
      perSpeaker.set(label, []);
    }
    perSpeaker.get(label)!.push(seg.text);
  }
  const perSpeakerText: Record<string, string> = {};
  for (const [speaker, lines] of perSpeaker) {
    perSpeakerText[speaker] = lines.join("\n");
  }
  return { speakerList, perSpeakerText };
}

function buildJoinedText(segments: readonly TranscriptSegment[]): string {
  return segments
    .map((s) => {
      const prefix = s.speaker
        ? `[${s.timecode}] ${s.speaker}: `
        : `[${s.timecode}] `;
      return `${prefix}${s.text}`;
    })
    .join("\n");
}

export interface BuildTranscriptsContextDataArgs {
  /** Active transcript, or null when none is open (e.g. empty viewer). */
  transcript: Transcript | null;
  /** Live playback position in seconds (read off the `<audio>` element). */
  currentTime: number;
  /** True when audio is playing (not paused / ended). */
  isPlaying: boolean;
  /** Current playback rate multiplier (1 = real-time). */
  playbackSpeed: number;
  /** Browser text selection scoped to the transcript region. Empty when none. */
  selectionText?: string;
  /** True when the title/description metadata editor is open. */
  isEditingMetadata?: boolean;
}

/**
 * Canonical `contextData` for `matrx-user/transcripts`.
 *
 * Pure mapping of live viewer state → `createTranscriptsScope(...)`, so the
 * runtime hook (`useTranscriptsSurfaceScope`) and any demo share one shape.
 * Emits the auto-injected baselines with real values where the surface has
 * them (`content` = the joined transcript, `selection` = the browser
 * selection, `context` = a small surface blob) plus every custom value the
 * manifest declares that the viewer can source.
 */
export function buildTranscriptsContextData(
  args: BuildTranscriptsContextDataArgs,
): Record<string, unknown> {
  const {
    transcript,
    currentTime,
    isPlaying,
    playbackSpeed,
    selectionText = "",
    isEditingMetadata = false,
  } = args;

  const transcriptOpen = transcript != null;
  const segments = transcript?.segments ?? [];

  const currentSegment = findCurrentSegment(segments, currentTime);
  const hasSelection = selectionText.length > 0;

  const joinedText = buildJoinedText(segments);
  const { speakerList, perSpeakerText } = buildSpeakerData(segments);

  const activeScopeKind: "selection" | "segment" | "transcript" | "empty" =
    !transcriptOpen
      ? "empty"
      : hasSelection
        ? "selection"
        : currentSegment
          ? "segment"
          : "transcript";

  const activeText = !transcriptOpen
    ? ""
    : hasSelection
      ? selectionText
      : currentSegment
        ? currentSegment.text
        : joinedText;

  const durationFromMetadata =
    typeof transcript?.metadata?.duration === "number"
      ? transcript.metadata.duration
      : undefined;

  const editorMode: "view" | "edit-metadata" | "edit-segments" =
    isEditingMetadata ? "edit-metadata" : "view";

  const surround: Record<string, unknown> = {
    active_scope_kind: activeScopeKind,
    transcript_open: transcriptOpen,
    segment_count: segments.length,
    speaker_count: speakerList.length,
    current_timecode: currentSegment
      ? formatTimecode(currentSegment.seconds)
      : undefined,
  };

  const scope = createTranscriptsScope({
    // Required (alwaysAvailable: true)
    active_scope_kind: activeScopeKind,
    speaker_list: speakerList,
    has_video: Boolean(transcript?.video_file_path),
    editor_mode: editorMode,

    // Baseline + selection
    selection: hasSelection ? selectionText : undefined,
    content: transcriptOpen ? joinedText : undefined,
    context: surround,

    // Selection / segment / playback mirror
    active_text: activeText || undefined,
    current_segment_id: currentSegment?.id,
    current_segment_text: currentSegment?.text,
    current_segment_speaker: currentSegment?.speaker || undefined,
    current_segment_start_seconds: currentSegment?.seconds,
    current_segment_timecode: currentSegment
      ? formatTimecode(currentSegment.seconds)
      : undefined,
    current_playback_time: transcriptOpen ? currentTime : undefined,

    // Transcript identity & metadata
    transcript_id: transcript?.id,
    transcript_title: transcript?.title,
    transcript_description: transcript?.description || undefined,
    transcript_source_type: transcript?.source_type,
    transcript_duration_seconds: durationFromMetadata,
    transcript_tags: transcript?.tags ?? undefined,
    transcript_folder: transcript?.folder_name || undefined,

    // Speaker dimension
    per_speaker_text:
      Object.keys(perSpeakerText).length > 0 ? perSpeakerText : undefined,

    // Segments dimension
    all_segments: transcriptOpen
      ? segments.map((s) => ({
          id: s.id,
          timecode: s.timecode,
          seconds: s.seconds,
          text: s.text,
          speaker: s.speaker,
        }))
      : undefined,
    all_segments_text: transcriptOpen ? joinedText : undefined,

    // Media + editor state
    audio_file_path: transcript?.audio_file_path ?? undefined,
    is_playing: transcriptOpen ? isPlaying : undefined,
    playback_speed: transcriptOpen ? playbackSpeed : undefined,
  });

  return scope as Record<string, unknown>;
}
