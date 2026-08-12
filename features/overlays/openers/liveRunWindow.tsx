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
 * - `useFloatingLiveRun({active, instanceId, …})` — the one-hook migration for a
 *   surface whose run state already lives in React.
 * - `openLiveRunWindowAction({instanceId, …})` — the plain action, for
 *   thunk-style code that launches an agent and must float its own run without
 *   threading a callback up to a component just to call a hook.
 *
 * Pass a STABLE `instanceId` (e.g. `brief:${nodeId}`) when a surface should
 * reuse one window per subject rather than stacking a new one per click.
 */

import { useCallback, useEffect, useRef } from "react";

import type { LiveRunProgressState } from "@/features/agents/components/live-run/LiveRunProgress";
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
  /** Stable id to reuse one window per subject. Omit for a fresh window. */
  instanceId?: string;
  /**
   * Per-kind size override — only after watching that kind render in the
   * default box and seeing it be wrong. The default matches the `/chat`
   * reading column, which is what every kind component is tuned against.
   */
  width?: number | string;
  height?: number | string;
  /** Stable row-based progress for non-token work; replaces the transcript. */
  progress?: LiveRunProgressState | null;
}

export interface LiveRunWindowHandle {
  instanceId: string;
  /** Re-open with merged data — how a late `requestId` reaches the window. */
  update: (patch: Partial<OpenLiveRunWindowOptions>) => void;
  close: () => void;
}

/**
 * The plain action — the same window, opened from anywhere a hook cannot run
 * (a thunk, a middleware, a callback outside React). Dispatching it again with
 * the same `instanceId` re-binds the open window to a new run, which is how a
 * long multi-step pipeline keeps ONE window instead of stacking one per step.
 */
export function openLiveRunWindowAction(
  opts: OpenLiveRunWindowOptions & { instanceId: string },
) {
  return openOverlay({
    overlayId: OVERLAY_ID,
    instanceId: opts.instanceId,
    data: {
      windowInstanceId: opts.instanceId,
      conversationId: opts.conversationId ?? null,
      requestId: opts.requestId ?? null,
      label: opts.label ?? null,
      pending: opts.pending ?? false,
      // Undefined (not null) so the component's chat-matched defaults
      // apply — an explicit null would be passed through as a size.
      width: opts.width,
      height: opts.height,
      progress: opts.progress ?? null,
    },
  });
}

export function useOpenLiveRunWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenLiveRunWindowOptions = {}): LiveRunWindowHandle => {
      const instanceId = opts.instanceId ?? `${OVERLAY_ID}-${Date.now()}`;
      let current: OpenLiveRunWindowOptions = { ...opts };

      const push = () =>
        dispatch(openLiveRunWindowAction({ ...current, instanceId }));

      push();
      return {
        instanceId,
        update: (patch) => {
          current = { ...current, ...patch };
          push();
        },
        close: () =>
          dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),
      };
    },
    [dispatch],
  );
}

export interface FloatingLiveRunOptions extends Omit<
  OpenLiveRunWindowOptions,
  "pending" | "instanceId"
> {
  /** True while the run is in flight. The window opens on the false→true edge. */
  active: boolean;
  /** Stable per-subject id so re-running reuses ONE window instead of stacking. */
  instanceId: string;
}

/**
 * 🚨 THE FLOATING LAW, as one hook — the migration for a surface that renders
 * `<LiveRunDisplay>` inline ABOVE its own content.
 *
 * An inline block shifts everything below it the instant a run starts; this
 * opens the canonical floating window instead, so the page never moves. It:
 *
 * - opens on the run's false→true edge (`pending`, before a requestId exists),
 * - pushes the `requestId` / `conversationId` / `label` in as they land,
 * - **never auto-closes** — not on completion, and NOT on unmount. The finished
 *   output is what the user came for, and a host that remounts when its results
 *   land (a query invalidation, a route re-render) would otherwise close the
 *   window at the exact moment the content completed. Verified on
 *   `/marketing/keyword-research`, where the results refetch remounts the
 *   launcher. The window is ephemeral and has its own close button; the USER
 *   dismisses it, and a long run keeps streaming while they work elsewhere.
 *
 * Because the `instanceId` is stable, a remount mid-run re-binds the SAME
 * window instead of stacking a second one.
 */
export function useFloatingLiveRun(opts: FloatingLiveRunOptions): void {
  const open = useOpenLiveRunWindow();
  const handleRef = useRef<LiveRunWindowHandle | null>(null);
  const {
    active,
    instanceId,
    conversationId,
    requestId,
    label,
    width,
    height,
    progress,
  } = opts;

  useEffect(() => {
    if (!active) return;
    if (!handleRef.current) {
      handleRef.current = open({ instanceId, pending: true, width, height });
    }
    handleRef.current.update({
      conversationId,
      requestId,
      label,
      progress,
      // `pending` only until a stream handle exists to bind.
      pending: !requestId && !conversationId,
    });
  }, [
    active,
    open,
    instanceId,
    conversationId,
    requestId,
    label,
    width,
    height,
    progress,
  ]);
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
  const {
    instanceId,
    conversationId,
    requestId,
    label,
    pending,
    width,
    height,
    progress,
  } = props;

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
      width,
      height,
      progress,
    });
  }, [conversationId, requestId, label, pending, width, height, progress]);

  return null;
}
