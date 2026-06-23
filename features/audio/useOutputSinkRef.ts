// features/audio/useOutputSinkRef.ts
//
// A callback ref that routes a real `<audio>` / `<video>` element to the user's
// chosen output device via `HTMLMediaElement.setSinkId`, and re-applies whenever
// the chosen device changes. Feature-detected (no-op on Safari). It also
// forwards the node to an optional external ref so callers that already pass a
// `mediaElementRef` keep theirs.
//
// This is the media-element half of audio output routing; the AudioContext half
// (Cartesia TTS) lives in `audioOutputSink.ts`'s constructor patch.

"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  applySinkToMediaElement,
  subscribeOutputDevice,
} from "@/features/audio/audioOutputSink";

type MediaEl = HTMLMediaElement | null;

type AnyMediaRef = React.Ref<
  HTMLImageElement | HTMLVideoElement | HTMLAudioElement
>;

/**
 * Forward a node to a caller-supplied ref (object or function form). Kept at
 * module scope so the React Compiler doesn't see this as "mutating a hook
 * argument" (which it forbids) — here `ref` is an ordinary function parameter.
 */
function assignRef(
  ref: AnyMediaRef | undefined,
  node: HTMLVideoElement | HTMLAudioElement | null,
): void {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(node);
    return;
  }
  (
    ref as React.MutableRefObject<
      HTMLImageElement | HTMLVideoElement | HTMLAudioElement | null
    >
  ).current = node;
}

/**
 * Returns a callback ref to attach to an `<audio>`/`<video>`. When the element
 * mounts it routes to the current preferred sink; while mounted it re-routes on
 * every preferred-device change. `externalRef` (if given) still receives the
 * node.
 */
export function useOutputSinkRef(
  externalRef?:
    | React.Ref<HTMLImageElement | HTMLVideoElement | HTMLAudioElement>
    | undefined,
): (node: HTMLVideoElement | HTMLAudioElement | null) => void {
  const elRef = useRef<MediaEl>(null);

  // Re-apply the sink whenever the preferred device changes while mounted.
  useEffect(() => {
    return subscribeOutputDevice(() => {
      void applySinkToMediaElement(elRef.current);
    });
  }, []);

  return useCallback(
    (node: HTMLVideoElement | HTMLAudioElement | null) => {
      elRef.current = node;
      if (node) void applySinkToMediaElement(node);
      // Forward to the caller's ref (object or function form).
      assignRef(externalRef, node);
    },
    [externalRef],
  );
}
