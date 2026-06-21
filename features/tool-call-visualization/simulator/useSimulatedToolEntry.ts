"use client";

/**
 * useSimulatedToolEntry — replays a `StreamRecording` into a live-evolving
 * `ToolLifecycleEntry`, so tool renderers (and the shell) can be exercised
 * EXACTLY as they behave during a real stream — no backend, no mocks.
 *
 * The realism contract (see `streamRecording.ts`): only whole sections are
 * appended over time. There is NO character-by-character trickle here — each
 * `tool_progress` step appends one complete section to `result`, spaced out in
 * time, which is how search/research results actually arrive on the wire.
 *
 * Lifecycle: `started → progress (accumulating) → completed`.
 *
 * Timer discipline: every step is scheduled with `setTimeout` against a single
 * playback start. ALL pending timers are cleared on unmount AND whenever
 * `playKey` changes (Play / Replay), so there are never overlapping playbacks
 * or leaked timers.
 */

import { useEffect, useRef, useState } from "react";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { ToolEventPayload } from "@/types/python-generated/stream-events";
import type { StreamRecording } from "./streamRecording";

export interface UseSimulatedToolEntryOptions {
  /**
   * Bump this (e.g. a `useState` counter) to (re)start playback from t=0.
   * Changing it resets the entry to its pre-stream state and clears any
   * in-flight timers from the previous run.
   */
  playKey: number;
}

/** The pre-stream resting state of the entry, derived from the recording. */
function buildInitialEntry(
  recording: StreamRecording | null,
): ToolLifecycleEntry {
  const callId = "sim-tool";
  const startedAt = new Date().toISOString();
  return {
    callId,
    toolName: recording?.toolName ?? "unknown",
    displayName: recording?.displayName ?? recording?.toolName ?? "Tool",
    status: "started",
    arguments: recording?.args ?? {},
    startedAt,
    completedAt: null,
    latestMessage: null,
    latestData: null,
    result: null,
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [],
  };
}

export function useSimulatedToolEntry(
  recording: StreamRecording | null,
  opts: UseSimulatedToolEntryOptions,
): ToolLifecycleEntry {
  const { playKey } = opts;
  const [entry, setEntry] = useState<ToolLifecycleEntry>(() =>
    buildInitialEntry(recording),
  );

  // Track active timers so we can clear them all on replay / unmount.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Clear any timers still pending from a previous playback.
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];

    if (!recording) {
      setEntry(buildInitialEntry(null));
      return;
    }

    // Reset to the pre-stream state for this run. A fresh callId/startedAt per
    // run keeps the shell's keying clean across replays.
    const callId = `sim-${playKey}`;
    const startedAt = new Date().toISOString();
    const base: ToolLifecycleEntry = {
      ...buildInitialEntry(recording),
      callId,
      startedAt,
    };
    setEntry(base);

    // Schedule every step relative to this playback's start.
    for (const step of recording.steps) {
      const handle = setTimeout(() => {
        setEntry((prev) => {
          const wireEvent: ToolEventPayload = {
            event: step.event,
            call_id: prev.callId,
            tool_name: recording.toolName,
            timestamp: Date.now(),
            message: step.message ?? null,
            data: step.data,
          };
          const events = [...prev.events, wireEvent];

          if (step.event === "tool_completed") {
            return {
              ...prev,
              status: "completed",
              result: recording.finalResult,
              completedAt: new Date().toISOString(),
              latestMessage: step.message ?? prev.latestMessage,
              events,
            };
          }

          if (step.event === "tool_error") {
            return {
              ...prev,
              status: "error",
              errorMessage: step.message ?? "Tool failed",
              completedAt: new Date().toISOString(),
              events,
            };
          }

          // tool_started / tool_progress / tool_step — accumulate.
          const grownResult =
            step.appendResult != null
              ? `${typeof prev.result === "string" ? prev.result : ""}${
                  step.appendResult
                }`
              : prev.result;

          return {
            ...prev,
            status: step.event === "tool_started" ? "started" : "progress",
            result: grownResult,
            latestMessage: step.message ?? prev.latestMessage,
            latestData: step.data ?? prev.latestData,
            events,
          };
        });
      }, step.afterMs);
      timersRef.current.push(handle);
    }

    return () => {
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current = [];
    };
    // Re-run whenever the user presses Play/Replay or the recording changes.
  }, [playKey, recording]);

  return entry;
}
