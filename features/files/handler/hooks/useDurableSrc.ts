/**
 * features/files/handler/hooks/useDurableSrc.ts
 *
 * Error recovery for durable media URLs: session refresh, not URL re-mint.
 *
 * Durable file URLs never expire — when a private file's `<img>` / `<video>`
 * / `<audio>` fails to load, the URL is not the problem; the browser's
 * `mx_files_session` cookie is (missing, expired server-side, or minted for
 * another identity). The recovery is therefore to re-establish the session
 * cookie (`ensureFilesSession({ force: true })`) and retry the SAME src —
 * we bump a retry counter that changes the element `key`, forcing the
 * browser to re-request the identical URL with the fresh cookie attached.
 *
 * After one retry the hook gives up (`failed = true`) — a second failure
 * means access was genuinely denied or the file is gone, and looping would
 * hammer the session endpoint.
 *
 * Legacy stored signed URLs (old rows) are passed through untouched: they
 * are dead when they are dead, and the durability guards classify them —
 * this hook does not resurrect them unless a `fileId` is provided, in which
 * case callers should already be binding a durable URL instead.
 */

"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { recognizeOurFileUrl } from "@/lib/media/our-file-sources";
import { ensureFilesSession } from "../session";

type MediaErrorEvent = SyntheticEvent<
  HTMLImageElement | HTMLVideoElement | HTMLAudioElement
>;

export interface DurableSrc {
  /** URL to render — always the input src; retries re-request the same URL. */
  src: string;
  /**
   * Bump this into the media element's `key` (or otherwise force a remount)
   * so a retry actually re-fires the network request for the same src.
   */
  retryKey: number;
  /** Wire to the media element's `onError`. Refreshes the file session once. */
  onError: (event: MediaErrorEvent) => void;
  /** True once the single session-refresh retry is exhausted. */
  failed: boolean;
}

export function useDurableSrc(
  src: string | null,
  fileId?: string,
  onErrorExternal?: (event: MediaErrorEvent) => void,
): DurableSrc {
  const [result, setResult] = useState({
    source: src,
    retryKey: 0,
    failed: false,
  });
  const retried = useRef(false);

  // A different URL deserves a fresh retry allowance. The visible state is
  // keyed by source below, so this effect only resets the event-handler guard.
  useEffect(() => {
    retried.current = false;
  }, [src]);

  // Retry only URLs that are OURS: an explicit fileId proves it; otherwise
  // the recognizer classifies the URL (cheap — substring pre-check before any
  // parse). A foreign URL is a transparent passthrough: a session refresh
  // can't resurrect someone else's link rot.
  const isOurs = !!fileId || (!!src && recognizeOurFileUrl(src) !== null);

  const onError = (event: MediaErrorEvent) => {
    if (src && isOurs && !retried.current) {
      retried.current = true;
      console.warn(
        "[file-handler] media failed to load — refreshing the file session " +
          `and retrying the same durable URL. fileId=${fileId ?? "(from url)"}`,
      );
      void ensureFilesSession({ force: true }).then(
        () =>
          setResult((current) => ({
            source: src,
            retryKey: current.source === src ? current.retryKey + 1 : 1,
            failed: false,
          })),
        () => {
          setResult({ source: src, retryKey: 0, failed: true });
          onErrorExternal?.(event);
        },
      );
      return;
    }
    setResult({ source: src, retryKey: 0, failed: true });
    onErrorExternal?.(event);
  };

  return {
    src: src ?? "",
    retryKey: result.source === src ? result.retryKey : 0,
    onError,
    failed: result.source === src ? result.failed : false,
  };
}

export default useDurableSrc;
