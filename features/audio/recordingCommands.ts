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
  if (warmSafetyTimer) {
    clearTimeout(warmSafetyTimer);
    warmSafetyTimer = null;
  }
  if (!warmHold) return;
  warmHold = false;
  releaseMicStream();
}

/** Never hold the warm mic forever if the engine fails to mount (chunk load
 *  failure, host unmounted) — the mic light would stay on with no recording. */
const WARM_HOLD_SAFETY_MS = 20_000;
let warmSafetyTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Acquire the shared mic stream in the current (user-gesture) tick so the
 * permission prompt / OS grant races the engine chunk download. The engine's
 * own `acquireMicStream` coalesces onto this warm stream.
 *
 * Hold accounting: `acquireMicStream()` increments the refcount SYNCHRONOUSLY,
 * so `releaseWarmHold()` is always the one matched release — including while
 * the acquisition is still in flight (the manager parks the fresh stream in
 * keepalive when it resolves with zero holders). Do NOT release again in the
 * promise callbacks; that unbalances the refcount and steals the engine's own
 * hold, killing a live recording seconds in.
 */
function warmMicForPendingStart(): void {
  if (warmHold) return;
  warmHold = true;
  acquireMicStream().catch(() => {
    // Acquisition failed — the manager already decremented internally; this
    // warm hold no longer exists. The engine surfaces the permission error
    // through its normal onError path when the queued start flushes.
    warmHold = false;
  });
  if (warmSafetyTimer) clearTimeout(warmSafetyTimer);
  warmSafetyTimer = setTimeout(() => {
    warmSafetyTimer = null;
    if (!warmHold || impl) return;
    console.error(
      "[recordingCommands] queued start abandoned — the recording engine " +
        "never registered within 20s of activation (Impl chunk failed to " +
        "load?). Releasing the warm mic hold so the mic light turns off.",
    );
    pendingStart?.resolve();
    pendingStart = null;
    releaseWarmHold();
  }, WARM_HOLD_SAFETY_MS);
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
