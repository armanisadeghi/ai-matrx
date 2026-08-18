"use client";

/**
 * useSamplePreviewRun — puts the sample run into the REAL run slice.
 *
 * The preview pane renders `RunSurfaceView` with `adopt={false}`, so nothing
 * here touches the network: the events built by `sample-run.ts` are folded by
 * the same reducer that folds live SSE frames, and every selector, progress
 * rail, and kind component downstream is reading genuine run state.
 *
 * Re-seeding is a detach + rebuild rather than a patch, because the timeline
 * runs backwards as often as forwards and a fold is only monotonic forwards.
 */

import { useEffect, useId } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";

import {
  applyNodeStreamMeta,
  applyRunEvent,
  attachRun,
  detachRun,
} from "../redux/workflow-runs.slice";
import type { WorkflowDefinitionLike } from "../trigger-points";
import { sampleRunFrames } from "./sample-run";

/**
 * @returns the run id the preview should render, or null while disabled.
 */
export function useSamplePreviewRun(
  definition: WorkflowDefinitionLike | null,
  momentIndex: number,
  enabled: boolean,
): string | null {
  const dispatch = useAppDispatch();
  // Unique per mounted builder, so two open tabs never share sample state.
  const runId = `sample-run:${useId()}`;

  useEffect(() => {
    if (!enabled || !definition) return;
    dispatch(detachRun({ runId }));
    dispatch(attachRun({ runId, definitionId: null }));
    const { events, streams } = sampleRunFrames(definition, runId, momentIndex);
    events.forEach((event, i) => {
      dispatch(applyRunEvent({ runId, event, seq: i + 1, replay: false }));
    });
    for (const event of streams) {
      dispatch(applyNodeStreamMeta({ runId, event }));
    }
    return () => {
      dispatch(detachRun({ runId }));
    };
  }, [dispatch, definition, momentIndex, enabled, runId]);

  return enabled && definition ? runId : null;
}
