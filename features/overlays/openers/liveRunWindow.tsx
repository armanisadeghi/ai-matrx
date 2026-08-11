"use client";

/**
 * Opener for the `liveRunWindow` overlay — the generic floating "watch this AI
 * run" panel.
 *
 * Use this instead of inserting a live-run block into your page. A block at the
 * top of a surface shifts everything below it the moment a run starts and puts
 * the model's output above the thing the user is editing; this floats, so the
 * page never moves and the user can keep working underneath.
 *
 * - `useOpenLiveRunWindow()` — imperative. Returns a handle with `instanceId`,
 *   `update(...)` (the run's requestId usually lands AFTER the window opens),
 *   and `close()`.
 * - `<LiveRunWindowController />` — declarative: mount to open, unmount to
 *   close, props flow straight through.
 *
 * Pass a STABLE `instanceId` (e.g. `brief:${nodeId}`) when a surface should
 * reuse one window per subject rather than stacking a new one per click.
 */

import { useCallback, useEffect, useRef } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "liveRunWindow" as const;

export interface OpenLiveRunWindowOptions {
  /** Preferred binding — a conversation-backed run. */
  conversationId?: string | null;
  /** Adopted server-pipeline runs bind by request id. */
  requestId?: string | null;
  /** What the user is watching, e.g. "Drafting brief". */
  label?: string | null;
  /** Launched, but no stream has connected yet. */
  pending?: boolean;
  /** Optional line under the title — where the result will land. */
  subtitle?: string | null;
  /** Stable id to reuse one window per subject. Omit for a fresh window. */
  instanceId?: string;
}

export interface LiveRunWindowHandle {
  instanceId: string;
  /** Re-open with merged data — how a late `requestId` reaches the window. */
  update: (patch: Partial<OpenLiveRunWindowOptions>) => void;
  close: () => void;
}

export function useOpenLiveRunWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenLiveRunWindowOptions = {}): LiveRunWindowHandle => {
      const instanceId = opts.instanceId ?? `${OVERLAY_ID}-${Date.now()}`;
      let current: OpenLiveRunWindowOptions = { ...opts };

      const push = () =>
        dispatch(
          openOverlay({
            overlayId: OVERLAY_ID,
            instanceId,
            data: {
              windowInstanceId: instanceId,
              conversationId: current.conversationId ?? null,
              requestId: current.requestId ?? null,
              label: current.label ?? null,
              pending: current.pending ?? false,
              subtitle: current.subtitle ?? null,
            },
          }),
        );

      push();
      return {
        instanceId,
        update: (patch) => {
          current = { ...current, ...patch };
          push();
        },
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),
      };
    },
    [dispatch],
  );
}

/**
 * Declarative form. Renders nothing visible; opens on mount, closes on
 * unmount, and pushes prop changes into the open window.
 */
export function LiveRunWindowController(
  props: OpenLiveRunWindowOptions & { instanceId: string },
): null {
  const open = useOpenLiveRunWindow();
  const handleRef = useRef<LiveRunWindowHandle | null>(null);
  const { instanceId, conversationId, requestId, label, pending, subtitle } = props;

  useEffect(() => {
    const handle = open({ instanceId });
    handleRef.current = handle;
    return () => {
      handle.close();
      handleRef.current = null;
    };
  }, [open, instanceId]);

  useEffect(() => {
    handleRef.current?.update({
      conversationId,
      requestId,
      label,
      pending,
      subtitle,
    });
  }, [conversationId, requestId, label, pending, subtitle]);

  return null;
}
