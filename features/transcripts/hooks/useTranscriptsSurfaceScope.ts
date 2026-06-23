/**
 * Build the `matrx-user/transcripts` surface scope at trigger time.
 *
 * Returns a `() => SurfaceScopePayload` builder rather than a static object,
 * because the audio element's `currentTime` and the window's text selection
 * live outside React state — the caller wants the moment-of-click value, not
 * a stale snapshot from the last render.
 *
 * Reads the active transcript from `TranscriptsContext`; live playback state
 * (`isPlaying`, `playbackSpeed`, current time) is read directly off the
 * `<audio>` element at call time. The actual scope shape is produced by the
 * pure `buildTranscriptsContextData` so this hook and any demo share one shape.
 */

import { useCallback } from "react";
import type { RefObject } from "react";

import { useTranscriptsContext } from "@/features/transcripts/context/TranscriptsContext";
import { buildTranscriptsContextData } from "@/features/transcripts/agent-context/buildTranscriptsContextData";
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

export function useTranscriptsSurfaceScope(
  params: UseTranscriptsSurfaceScopeParams,
): () => SurfaceScopePayload {
  const { audioRef, isEditingMetadata, contentContainerRef } = params;
  const { activeTranscript } = useTranscriptsContext();

  return useCallback(() => {
    const audio = audioRef.current;
    const currentTime = audio?.currentTime ?? 0;
    const isPlaying = audio ? !audio.paused && !audio.ended : false;
    const playbackSpeed = audio?.playbackRate ?? 1;

    return buildTranscriptsContextData({
      transcript: activeTranscript ?? null,
      currentTime,
      isPlaying,
      playbackSpeed,
      selectionText: getSelectionInside(contentContainerRef),
      isEditingMetadata,
    }) as SurfaceScopePayload;
  }, [activeTranscript, audioRef, contentContainerRef, isEditingMetadata]);
}
