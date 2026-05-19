/**
 * Build the `matrx-user/transcripts` surface scope at trigger time.
 *
 * Returns a `() => SurfaceScopePayload` builder rather than a static object,
 * because the audio element's `currentTime` and the window's text selection
 * live outside React state — the caller wants the moment-of-click value, not
 * a stale snapshot from the last render.
 *
 * Reads the active transcript from `TranscriptsContext`; live playback state
 * (`isPlaying`, `playbackSpeed`, current time) is passed in as params from
 * the viewer that owns the `<audio>` element and its `useState`.
 */

import { useCallback } from "react";
import type { RefObject } from "react";

import { useTranscriptsContext } from "@/features/transcripts/context/TranscriptsContext";
import type { TranscriptSegment } from "@/features/transcripts/types";
import { createTranscriptsScope } from "@/features/surfaces/manifests/transcripts.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

export interface UseTranscriptsSurfaceScopeParams {
  /**
   * Live reference to the viewer's `<audio>` element. The hook reads
   * `currentTime` / `paused` / `playbackRate` directly off the DOM at
   * trigger time, so the emitted scope always reflects the moment the user
   * clicked an action.
   */
  audioRef: RefObject<HTMLAudioElement | null>;
  /**
   * True while the title/description metadata editor is open. Drives
   * `editor_mode`.
   */
  isEditingMetadata: boolean;
  /**
   * Optional container element. When provided, browser text selections are
   * only honored if the selection's anchor is inside it (avoids reading a
   * sidebar selection as if it were transcript content).
   */
  contentContainerRef?: RefObject<HTMLElement | null>;
}

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

function getSelectionInside(
  containerRef: RefObject<HTMLElement | null> | undefined,
): string {
  if (typeof window === "undefined") return "";
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return "";
  }
  const text = selection.toString();
  if (!text) return "";
  const container = containerRef?.current;
  if (!container) return text;
  const anchor = selection.anchorNode;
  if (!anchor) return "";
  return container.contains(anchor) ? text : "";
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
      const prefix = s.speaker ? `[${s.timecode}] ${s.speaker}: ` : `[${s.timecode}] `;
      return `${prefix}${s.text}`;
    })
    .join("\n");
}

export function useTranscriptsSurfaceScope(
  params: UseTranscriptsSurfaceScopeParams,
): () => SurfaceScopePayload {
  const { audioRef, isEditingMetadata, contentContainerRef } = params;
  const { activeTranscript } = useTranscriptsContext();

  return useCallback(() => {
    const transcriptOpen = activeTranscript != null;
    const segments = activeTranscript?.segments ?? [];

    const audio = audioRef.current;
    const currentTime = audio?.currentTime ?? 0;
    const isPlaying = audio ? !audio.paused && !audio.ended : false;
    const playbackSpeed = audio?.playbackRate ?? 1;

    const currentSegment = findCurrentSegment(segments, currentTime);
    const selectionText = getSelectionInside(contentContainerRef);
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
      typeof activeTranscript?.metadata?.duration === "number"
        ? activeTranscript.metadata.duration
        : undefined;

    const editorMode: "view" | "edit-metadata" | "edit-segments" =
      isEditingMetadata ? "edit-metadata" : "view";

    return createTranscriptsScope({
      // Required (alwaysAvailable: true)
      active_scope_kind: activeScopeKind,
      speaker_list: speakerList,
      has_video: Boolean(activeTranscript?.video_file_path),
      editor_mode: editorMode,

      // Baseline + selection
      selection: hasSelection ? selectionText : undefined,
      content: transcriptOpen ? joinedText : undefined,

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
      transcript_id: activeTranscript?.id,
      transcript_title: activeTranscript?.title,
      transcript_description: activeTranscript?.description || undefined,
      transcript_source_type: activeTranscript?.source_type,
      transcript_duration_seconds: durationFromMetadata,
      transcript_tags: activeTranscript?.tags ?? undefined,
      transcript_folder: activeTranscript?.folder_name || undefined,

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
      audio_file_path: activeTranscript?.audio_file_path ?? undefined,
      is_playing: transcriptOpen ? isPlaying : undefined,
      playback_speed: transcriptOpen ? playbackSpeed : undefined,
    });
  }, [activeTranscript, audioRef, contentContainerRef, isEditingMetadata]);
}
