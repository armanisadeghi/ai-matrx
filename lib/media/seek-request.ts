"use client";

/**
 * lib/media/seek-request.ts
 *
 * ONE way for a host to move a media player to a time: pass a `SeekRequest`
 * (`seconds` + a `nonce` that changes on every click, so clicking the same
 * segment twice seeks twice). The player applies it to its own element — now
 * if the metadata is loaded, else the moment it is — and starts playback.
 * Used by `VideoPreview` / `AudioPreview`; a transcript segment or a chunk
 * click on the Source screen seeks through it (Otter: click → timestamp).
 */

import { useEffect, type RefObject } from "react";

export interface SeekRequest {
  seconds: number;
  nonce: number;
}

/** Apply a seek to an element. Exported for tests; hosts use the hook. */
export function applySeek(
  el: HTMLMediaElement,
  seek: SeekRequest,
  options: { play?: boolean } = {},
): () => void {
  const go = () => {
    el.currentTime = Math.max(0, seek.seconds);
    if (options.play !== false) {
      const played = el.play?.();
      // Autoplay refusals are the browser's call; the element stays seeked.
      if (played && typeof played.catch === "function")
        played.catch(() => undefined);
    }
  };
  // HAVE_METADATA = 1: before it, setting currentTime is ignored by some engines.
  if (el.readyState >= 1) {
    go();
    return () => undefined;
  }
  el.addEventListener("loadedmetadata", go, { once: true });
  return () => el.removeEventListener("loadedmetadata", go);
}

export function useSeekRequest(
  elementRef: RefObject<HTMLMediaElement | null>,
  seek: SeekRequest | null | undefined,
  /**
   * `mountKey` — whatever changes when the element (re)mounts (its src, a
   * retry key), so a seek asked for before the media loaded still lands.
   */
  options: { play?: boolean; mountKey?: unknown } = {},
): void {
  const nonce = seek?.nonce ?? null;
  const seconds = seek?.seconds ?? null;
  const { play, mountKey } = options;
  useEffect(() => {
    const el = elementRef.current;
    if (!el || nonce === null || seconds === null) return undefined;
    return applySeek(el, { seconds, nonce }, { play });
  }, [elementRef, nonce, seconds, play, mountKey]);
}
