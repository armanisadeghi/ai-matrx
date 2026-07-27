/**
 * Recording command proxy — the framework-free seam between the always-loaded
 * `useGlobalRecording()` hook and the lazily-mounted recording engine
 * (`providers/GlobalRecordingEngine.tsx`, inside `AudioSystemHostImpl`).
 *
 * On a cold tab the engine isn't mounted. The first `startRecordingCommand()`:
 *   1. fires the audio activation latch (mounts the audio system),
 *   2. warms the mic in the SAME user-gesture tick (`acquireMicStream` — the
 *      permission prompt races the Impl chunk download instead of waiting on it),
 *   3. queues the start (latest-wins) until the engine registers, then flushes.
 *
 * `stop`/`cancel`/`pause`/`resume` before the engine exists are safe no-ops —
 * nothing can be recording if the engine never mounted — except that a stop or
 * cancel racing a *pending* start clears the pending start (correct semantics:
 * the user changed their mind before capture began).
 *
 * Imports only the activation latch and `micStream` (both import-free).
 */

import { activateAudio } from "@/features/audio/activation";
import {
  acquireMicStream,
  releaseMicStream,
} from "@/features/audio/micStream";
import type {
  GlobalRecordingCommands,
  StartRecordingArgs,
} from "@/features/audio/recordingTypes";

let impl: GlobalRecordingCommands | null = null;

interface PendingStart {
  args: StartRecordingArgs;
  resolve: () => void;
  reject: (err: unknown) => void;
}
let pendingStart: PendingStart | null = null;

/** True while we hold a warm mic acquisition for a not-yet-flushed start. */
let warmHold = false;

function releaseWarmHold(): void {
  if (!warmHold) return;
  warmHold = false;
  releaseMicStream();
}

/**
 * Acquire the shared mic stream in the current (user-gesture) tick so the
 * permission prompt / OS grant races the engine chunk download. The engine's
 * own `acquireMicStream` coalesces onto this warm stream. Released once the
 * start is flushed to the engine (the engine holds its own reference) or the
 * pending start is abandoned. Failures are ignored here — the engine surfaces
 * permission errors through its normal `onError` path.
 */
function warmMicForPendingStart(): void {
  if (warmHold) return;
  warmHold = true;
  acquireMicStream()
    .then(() => {
      // If the pending start was abandoned while we were acquiring, drop the
      // hold immediately (keepalive clears the mic light shortly after).
      if (!warmHold) releaseMicStream();
    })
    .catch(() => {
      warmHold = false;
    });
}

/** Called by the engine on mount. Flushes any queued start. */
export function registerRecordingCommands(commands: GlobalRecordingCommands): void {
  impl = commands;
  if (pendingStart) {
    const pending = pendingStart;
    pendingStart = null;
    releaseWarmHold();
    commands.start(pending.args).then(pending.resolve, pending.reject);
  }
}

/** Called by the engine on unmount (StrictMode / teardown). */
export function unregisterRecordingCommands(): void {
  impl = null;
}

export function startRecordingCommand(args: StartRecordingArgs): Promise<void> {
  activateAudio();
  if (impl) return impl.start(args);
  warmMicForPendingStart();
  return new Promise<void>((resolve, reject) => {
    // Latest-wins, matching the engine's own start-always-wins takeover: a
    // superseded queued start simply never records. Resolve (not reject) the
    // old promise — callers treat start() resolution as "request accepted".
    pendingStart?.resolve();
    pendingStart = { args, resolve, reject };
  });
}

export function stopRecordingCommand(): void {
  if (pendingStart) {
    pendingStart.resolve();
    pendingStart = null;
    releaseWarmHold();
  }
  impl?.stop();
}

export function cancelRecordingCommand(): void {
  if (pendingStart) {
    pendingStart.resolve();
    pendingStart = null;
    releaseWarmHold();
  }
  impl?.cancel();
}

export function pauseRecordingCommand(): void {
  impl?.pause();
}

export function resumeRecordingCommand(): void {
  impl?.resume();
}
