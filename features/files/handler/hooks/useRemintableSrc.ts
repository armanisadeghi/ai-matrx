/**
 * features/files/handler/hooks/useRemintableSrc.ts
 *
 * Make a raw media URL *self-healing*.
 *
 * Some surfaces hold only a URL *string* — an AI model emitted
 * `![](https://matrx-user-files.s3…?…Signature=…&Expires=…)` into markdown,
 * or a legacy component was handed a stored `audioUrl` — not a `file_id` or a
 * `MediaRef`. Those can't go through `useFileSrc` / `<InlineMediaRef>` directly.
 *
 * The load-bearing rule (see CLAUDE.md "Media durability"): a user's own file
 * URL never just "expires". If we can recognize the URL as ours and recover its
 * `file_id`, a dead/expired signature must be re-minted from identity — never
 * surfaced as a broken `<img>` / `<video>` / `<audio>`.
 *
 * This hook is the single primitive for that case. Hand it the raw URL; render
 * the returned `src` and wire the returned `onError` to the element. For a
 * URL we don't own it's a transparent passthrough (the element renders the URL
 * as-is; `onError` just flags `failed` and forwards to the caller's handler).
 *
 * Prefer `<InlineMediaRef>` / `useFileSrc` when you actually have a `file_id`
 * or `MediaRef` — they mint up front. Reach for this hook only when all you
 * have is a URL string baked into content.
 */

"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { recognizeOurFileUrl } from "@/lib/media/our-file-sources";
import {
  getOrMintSignedUrl,
  invalidateSignedUrl,
} from "@/features/files/handler/intelligence/signed-url-cache";

const MAX_REMINT_ATTEMPTS = 2;

type MediaErrorEvent = SyntheticEvent<
  HTMLImageElement | HTMLVideoElement | HTMLAudioElement
>;

export interface RemintableSrc {
  /** URL to render — a freshly re-minted one after a load failure, else the original. */
  src: string;
  /** Wire to the media element's `onError`. Re-mints owned files before giving up. */
  onError: (event: MediaErrorEvent) => void;
  /**
   * True once re-mint attempts are exhausted (or the URL was never ours) and
   * the element still failed to load. Use it to render an error state if you
   * have one; many callers can ignore it.
   */
  failed: boolean;
}

export function useRemintableSrc(
  rawSrc: string | null | undefined,
  onErrorExternal?: (event: MediaErrorEvent) => void,
): RemintableSrc {
  // Recognize ownership + recover a re-mintable file_id. Cheap: the recognizer
  // short-circuits on a substring pre-check before any URL parse.
  const ownedFileId = rawSrc ? (recognizeOurFileUrl(rawSrc)?.fileId ?? null) : null;

  const [override, setOverride] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const remintAttempts = useRef(0);

  // A different URL deserves a fresh chance — clear any prior re-mint / failure.
  useEffect(() => {
    setOverride(null);
    setFailed(false);
    remintAttempts.current = 0;
  }, [rawSrc]);

  const onError = (event: MediaErrorEvent) => {
    if (ownedFileId && remintAttempts.current < MAX_REMINT_ATTEMPTS) {
      remintAttempts.current += 1;
      console.warn(
        "[file-handler] media failed to load — re-minting owned file " +
          "(a user's own file never just 'expires'). " +
          `fileId=${ownedFileId} attempt=${remintAttempts.current}`,
      );
      invalidateSignedUrl(ownedFileId);
      getOrMintSignedUrl(ownedFileId)
        .then((fresh) => setOverride(fresh.url))
        .catch((err) => {
          console.error(
            `[file-handler] re-mint FAILED for owned file ${ownedFileId}`,
            err,
          );
          setFailed(true);
          onErrorExternal?.(event);
        });
      return;
    }
    setFailed(true);
    onErrorExternal?.(event);
  };

  return { src: override ?? rawSrc ?? "", onError, failed };
}

export default useRemintableSrc;
