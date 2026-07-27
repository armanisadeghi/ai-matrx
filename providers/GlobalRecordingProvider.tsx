"use client";

/**
 * useGlobalRecording — context-free.
 *
 * The old `GlobalRecordingProvider` wrapped the entire app to hand this API
 * down via React context, dragging the whole recording graph (971-line
 * recorder hook → micStream, speechApi, audioSafetyStore, chunk journal, file
 * handler) into every authenticated route's bundle. It is gone:
 *
 *   - STATE lives in `recordingsSlice` (the engine mirrors every field,
 *     including `isFinalizing`) — read here via selectors.
 *   - COMMANDS live in `features/audio/recordingCommands.ts` — a framework-free
 *     proxy the lazily-mounted engine (`providers/GlobalRecordingEngine.tsx`,
 *     inside `AudioSystemHostImpl`) registers with. A start on a cold tab
 *     activates the audio system, warms the mic in the gesture tick, queues
 *     latest-wins, and flushes when the engine mounts.
 *
 * Consumers are unchanged: same hook names, same `GlobalRecordingApi` shape.
 * There is no provider to mount and no tree position requirement.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import {
  cancelRecordingCommand,
  pauseRecordingCommand,
  resumeRecordingCommand,
  startRecordingCommand,
  stopRecordingCommand,
} from "@/features/audio/recordingCommands";
import type {
  GlobalRecordingApi,
  StartRecordingArgs,
} from "@/features/audio/recordingTypes";

export type { GlobalRecordingApi, StartRecordingArgs };

export function useGlobalRecording(): GlobalRecordingApi {
  const isActive = useAppSelector((s) => s.recordings.isRecording);
  const isFinalizing = useAppSelector((s) => s.recordings.isFinalizing);
  const context = useAppSelector((s) => s.recordings.context);
  return {
    isActive,
    isFinalizing,
    context,
    start: startRecordingCommand,
    stop: stopRecordingCommand,
    cancel: cancelRecordingCommand,
    pause: pauseRecordingCommand,
    resume: resumeRecordingCommand,
  };
}

/**
 * Legacy "safe" variant from the context era. Recording is now always
 * available (the engine mounts on demand), so this never returns null — kept
 * so existing call sites compile and their `!== null` guards stay true.
 */
export function useGlobalRecordingOptional(): GlobalRecordingApi | null {
  return useGlobalRecording();
}
