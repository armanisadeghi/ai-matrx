"use client";

/**
 * useRetainRequestForViewer — mount-scoped retention of an `activeRequests`
 * row for ANY canonical viewer of streamed content.
 *
 * 🚨 THE DISAPPEARING-RUN CLASS. Every surface that renders a live agent run
 * (`MarkdownStream requestId=…`, `LiveRunDisplay`, a kind component fed by
 * `selectKindEnvelope`) reads from ONE place:
 * `state.activeRequests.byRequestId[requestId]`. That row is also reaped by
 * launcher hooks (`removeRequest` on unmount / before the next run) and by
 * conversation cleanup. When a reap lands while a viewer is still mounted,
 * the viewer goes blank INSTANTLY and PERMANENTLY — later stream events on a
 * missing row are silently dropped, so the content never comes back until a
 * full remount + rejoin. This is the "data streams in, then just disappears"
 * bug that has been re-introduced repeatedly. Full doctrine:
 * features/agents/docs/LIVE_RUN_RETENTION.md.
 *
 * The contract: every viewer of a requestId calls this hook. Owner cleanup
 * then DEFERS instead of deleting (`pendingRemovalByRequestId`), and the
 * last viewer's release completes the deletion. `StreamAwareChatMarkdown`
 * (the single component every `MarkdownStream` renders through) and
 * `LiveRunDisplay` both consume it, so ordinary surfaces get retention for
 * free. Reach for it directly only when a component reads request state via
 * selectors WITHOUT rendering through MarkdownStream.
 *
 * Retention is idempotent per mounted component (stable `useId`), no-ops on
 * an empty requestId, and survives requestId changes (release old, retain
 * new). It never blocks a row from being deleted after the viewer unmounts.
 */

import { useEffect, useId } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";

import {
  releaseRequestForViewer,
  retainRequestForViewer,
} from "./active-requests.slice";

export function useRetainRequestForViewer(
  requestId: string | null | undefined,
  viewerLabel: string,
): void {
  const dispatch = useAppDispatch();
  const viewerId = `${viewerLabel}:${useId()}`;

  useEffect(() => {
    if (!requestId) return;
    dispatch(retainRequestForViewer({ requestId, viewerId }));
    return () => {
      dispatch(releaseRequestForViewer({ requestId, viewerId }));
    };
  }, [dispatch, requestId, viewerId]);
}
