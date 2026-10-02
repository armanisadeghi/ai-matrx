"use client";

/**
 * THE FLOATING LAW, as two hooks — "a user must never watch a spinner while AI
 * works; the run streams, and it streams in `LiveRunWindow`"
 * (features/window-panels/FEATURE.md).
 *
 * Every migrated call site was writing the same ten lines: open the window
 * BEFORE the launch so the very first moment is visible, bind the conversation
 * when the stream connects, reuse one window per surface instead of stacking
 * one per click, and destroy the kept-alive instance when the surface goes
 * away. That is a primitive, not a snippet.
 *
 * - `useFloatingAgentRun()` — the whole thing for a component that BOTH
 *   launches and watches. Same `run({...})` contract as `useLiveAgentRun`,
 *   plus the window. This is the two-line migration from an await-only
 *   `useHeadlessAgentJson` site.
 * - `useFloatingRunWindow()` — for a run launched somewhere else (a thunk or
 *   lane taking `onConversationCreated` / `onRequestId`). `start(label)` opens
 *   the window and hands back the binder to pass into the launch.
 * - `useFloatingRunWindow({ track })` — the same window for a run whose state
 *   already lives in React (a launcher hook the surface only OBSERVES). The
 *   window follows `track.running`, and `track.visible` is the gate: while the
 *   run's own pane is on screen the float is suppressed, because the pane
 *   already renders it and a second copy is noise. Off screen — a tab pill, a
 *   collapsed section, a pane the host hid — it floats, so no pass is ever
 *   represented by a spinner. Omit `visible` for an ungated float.
 *
 * When NOT to use these: a surface whose entire screen at that moment IS the
 * wait (a full-screen "preparing your session…" state) renders `LiveRunDisplay`
 * inline instead — nothing to shift, and the window would float over an empty
 * page. That is the earned exception; everywhere else, float.
 */

import { useEffect, useId, useRef } from "react";
import {
  useOpenLiveRunWindow,
  type LiveRunWindowHandle,
} from "@/features/overlays/openers/liveRunWindow";
import {
  useLiveAgentRun,
  type LiveAgentRunOptions,
} from "@/features/agents/hooks/useLiveAgentRun";
import { useLiveRunHandle } from "@/features/agents/hooks/useLiveRunHandle";

/**
 * A run this hook only WATCHES — launched and owned elsewhere, its state read
 * straight out of React. Pass it as `track` and the window follows it; there is
 * nothing to call.
 */
export interface FloatingRunTrackState {
  /** True while the run is in flight. False closes the window. */
  running: boolean;
  conversationId?: string | null;
  requestId?: string | null;
  /** What the user is watching, e.g. "Cleaning up · Legal Editor". */
  label?: string | null;
  /**
   * THE VISIBILITY GATE. True when the run's own pane is on screen: the float
   * is suppressed, because that pane is the better home and a floating copy of
   * what is already rendered is noise. Omit to float whenever running.
   */
  visible?: boolean;
}

export interface FloatingRunWindowOptions {
  /**
   * Stable window identity. Defaults to one window per hook instance, reused
   * across runs — re-running replaces the run inside the same window rather
   * than stacking a second one.
   */
  instanceId?: string;
  /** Per-kind size override — only after watching the default box be wrong. */
  width?: number | string;
  height?: number | string;
  /**
   * Whether this hook owns the conversation instance's lifetime. False when
   * the launcher already owns it (`useLiveAgentRun` does), true for a
   * thunk-launched run kept alive with `keepInstance: true`.
   */
  owns?: boolean;
  /**
   * Follow a run launched elsewhere instead of calling `start()`. One hook
   * instance does one or the other, never both — they share the window handle.
   */
  track?: FloatingRunTrackState;
}

/** The binder for one launched run — hand these to the launcher's callbacks. */
export interface FloatingRun {
  /** `onConversationCreated` — the client-launched binding (preferred). */
  bind: (conversationId: string) => void;
  /** `onRequestId` — for launchers that only surface a request id. */
  bindRequest: (requestId: string) => void;
  /** Close this run's window (and release its instance when owned). */
  close: () => void;
}

export interface UseFloatingRunWindow {
  /** Open the window BEFORE launching, then bind the run to it. */
  start: (label: string) => FloatingRun;
  /** Close whatever is open (and release the owned instance). */
  close: () => void;
}

export function useFloatingRunWindow(
  options: FloatingRunWindowOptions = {},
): UseFloatingRunWindow {
  const { instanceId, width, height, owns = true, track } = options;
  const openWindow = useOpenLiveRunWindow();
  const run = useLiveRunHandle();
  // Default identity: ONE window per hook instance, stable for its lifetime, so
  // re-running replaces the run inside it instead of stacking windows.
  const fallbackId = useId();
  const windowId = instanceId ?? `floating-run-${fallbackId}`;
  const handleRef = useRef<LiveRunWindowHandle | null>(null);

  // The window is ours; it must not outlive the surface that opened it.
  useEffect(
    () => () => {
      handleRef.current?.close();
      handleRef.current = null;
    },
    [],
  );

  const close = () => {
    handleRef.current?.close();
    handleRef.current = null;
    if (owns) run.release();
  };

  // Tracked mode: the window is a pure function of the watched run's state.
  // Nothing here claims or releases the conversation instance — a tracked run
  // is owned by whoever launched it, and this hook only puts a screen on it.
  const trackRunning = track?.running ?? false;
  const trackVisible = track?.visible ?? false;
  const trackConversationId = track?.conversationId ?? null;
  const trackRequestId = track?.requestId ?? null;
  const trackLabel = track?.label ?? null;
  const tracking = track !== undefined;
  useEffect(() => {
    if (!tracking) return;
    // Not running, or its own pane is on screen → the float has no job.
    if (!trackRunning || trackVisible) {
      handleRef.current?.close();
      handleRef.current = null;
      return;
    }
    const patch = {
      conversationId: trackConversationId,
      requestId: trackRequestId,
      label: trackLabel,
      // Launched, but no stream handle has landed to bind yet.
      pending: !trackConversationId && !trackRequestId,
    };
    if (handleRef.current) handleRef.current.update(patch);
    else
      handleRef.current = openWindow({
        ...patch,
        instanceId: windowId,
        width,
        height,
      });
  }, [
    tracking,
    trackRunning,
    trackVisible,
    trackConversationId,
    trackRequestId,
    trackLabel,
    openWindow,
    windowId,
    width,
    height,
  ]);

  const start = (label: string): FloatingRun => {
    // The previous run's instance makes way for this one; the window itself is
    // reused (same instanceId), so the user never accumulates windows.
    if (owns) run.release();
    const handle = openWindow({
      instanceId: windowId,
      label,
      pending: true,
      width,
      height,
    });
    handleRef.current = handle;
    return {
      bind: (conversationId) => {
        if (owns) run.claim(conversationId);
        handle.update({ conversationId, pending: false });
      },
      bindRequest: (requestId) => handle.update({ requestId, pending: false }),
      close,
    };
  };

  return { start, close };
}

export interface UseFloatingAgentRun {
  /**
   * Run the agent. The window opens before the launch and streams the output;
   * `label` says what the user is watching ("Building your study plan").
   */
  run: <T = unknown>(
    opts: LiveAgentRunOptions<T> & { label?: string },
  ) => Promise<T>;
  isRunning: boolean;
  error: string | null;
  conversationId: string | null;
  /** Close the window (the run itself keeps going and still resolves). */
  closeWindow: () => void;
  /** Close the window AND clear the last run's error/handles. */
  reset: () => void;
}

export function useFloatingAgentRun(
  options: FloatingRunWindowOptions & { label?: string } = {},
): UseFloatingAgentRun {
  const live = useLiveAgentRun();
  // `useLiveAgentRun` already owns the instance lifecycle — the window must not
  // destroy it a second time.
  const floating = useFloatingRunWindow({ ...options, owns: false });

  async function run<T = unknown>(
    opts: LiveAgentRunOptions<T> & { label?: string },
  ): Promise<T> {
    const { label, ...runOptions } = opts;
    const bound = floating.start(label ?? options.label ?? "AI is working");
    return live.run<T>({
      ...(runOptions as LiveAgentRunOptions<T>),
      onConversationCreated: (conversationId) => {
        bound.bind(conversationId);
        opts.onConversationCreated?.(conversationId);
      },
    });
  }

  return {
    run,
    isRunning: live.isRunning,
    error: live.error,
    conversationId: live.conversationId,
    closeWindow: floating.close,
    reset: () => {
      floating.close();
      live.dismiss();
    },
  };
}
