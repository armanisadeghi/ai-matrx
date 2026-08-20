"use client";

import { useCallback, useEffect } from "react";

import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import {
  closeOverlay,
  openOverlay,
  selectOpenInstances,
} from "@/lib/redux/slices/overlaySlice";
import {
  focusWindow,
  restoreWindow,
} from "@/lib/redux/slices/windowManagerSlice";
import type { DoorAudience } from "@/features/hindsight/subject-doors";
import type { Finding } from "@/features/hindsight/types";

const OVERLAY_ID = "hindsightFindingWindow" as const;

export interface OpenHindsightFindingWindowOptions {
  finding: Finding;
  findings: Finding[];
  agentId?: string | null;
  audience: DoorAudience;
}

export interface HindsightFindingWindowHandle {
  close: () => void;
}

function instanceIdFor(enrollmentId: string): string {
  return `hindsight-findings|${enrollmentId}`;
}

export function useOpenHindsightFindingWindow() {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  return useCallback(
    (opts: OpenHindsightFindingWindowOptions): HindsightFindingWindowHandle => {
      const instanceId = instanceIdFor(opts.finding.enrollment_id);
      const open = selectOpenInstances(store.getState(), OVERLAY_ID);
      if (open.some((instance) => instance.instanceId === instanceId)) {
        dispatch(
          openOverlay({
            overlayId: OVERLAY_ID,
            instanceId,
            data: {
              finding: opts.finding,
              findings: opts.findings,
              agentId: opts.agentId ?? null,
              audience: opts.audience,
            },
          }),
        );
        dispatch(restoreWindow(instanceId));
        dispatch(focusWindow(instanceId));
        return {
          close: () =>
            dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),
        };
      }

      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId,
          data: {
            finding: opts.finding,
            findings: opts.findings,
            agentId: opts.agentId ?? null,
            audience: opts.audience,
          },
        }),
      );

      return {
        close: () =>
          dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),
      };
    },
    [dispatch, store],
  );
}

export function HindsightFindingWindowController(
  props: OpenHindsightFindingWindowOptions,
): null {
  const open = useOpenHindsightFindingWindow();

  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.finding, props.findings, props.agentId, props.audience]);

  return null;
}
