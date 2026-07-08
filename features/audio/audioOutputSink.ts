// features/audio/audioOutputSink.ts
//
// Universal audio OUTPUT (speaker) routing — the single place the app decides
// which physical output device every sound plays through.
//
// WHY THIS EXISTS
// ---------------
// Two unrelated playback paths exist: real `HTMLMediaElement`s (`<audio>` /
// `<video>` via `InlineMediaRef`) and Web Audio playback via our
// `SinkAwarePlayer` (features/audio/sinkAwarePlayer.ts — the fork of the
// Cartesia SDK WebPlayer). The browser exposes TWO sink APIs for these:
//
//   • `HTMLMediaElement.setSinkId(deviceId)` — Chrome/Firefox; routes one media
//     element. Used directly by `InlineMediaRef` via `applySinkToMediaElement`.
//   • `AudioContext.setSinkId(deviceId)` — Chromium-only; routes a Web Audio
//     graph. `SinkAwarePlayer` owns its per-utterance contexts and calls this
//     itself: it reads this store at context creation and subscribes for
//     mid-utterance device changes. (The old global `AudioContext` constructor
//     monkeypatch — `installAudioContextSinkRouting` + the `NO_SINK_ROUTING`
//     opt-out sentinel — is DELETED; nothing patches globals anymore.)
//
// SAFARI has NEITHER API. Everything here feature-detects and no-ops gracefully;
// on Safari the user picks the output device in macOS/iOS settings.
//
// One store, one subscribe channel, two appliers. The audio-devices manager is
// the only writer (`setPreferredOutputDeviceId`); InlineMediaRef +
// SinkAwarePlayer are the readers.

type SinkListener = (deviceId: string) => void;

interface SinkState {
  /** Current preferred output deviceId. "" = system default. */
  deviceId: string;
  listeners: Set<SinkListener>;
}

const state: SinkState = {
  deviceId: "",
  listeners: new Set(),
};

/** True when `HTMLMediaElement.setSinkId` exists (Chrome/Firefox, not Safari). */
export function mediaElementSinkSupported(): boolean {
  return (
    typeof HTMLMediaElement !== "undefined" &&
    "setSinkId" in HTMLMediaElement.prototype
  );
}

/** True when `AudioContext.setSinkId` exists (Chromium only). */
export function audioContextSinkSupported(): boolean {
  if (typeof window === "undefined") return false;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  return !!Ctor && "setSinkId" in Ctor.prototype;
}

/**
 * True when the browser can route output at all (either API). When false, the
 * speaker picker is disabled and the user is told to choose output in OS
 * settings.
 */
export function outputSelectionSupported(): boolean {
  return mediaElementSinkSupported() || audioContextSinkSupported();
}

/** Read the current preferred output deviceId ("" = system default). */
export function getPreferredOutputDeviceId(): string {
  return state.deviceId;
}

/**
 * Set the preferred output device. Notifies subscribers (InlineMediaRef
 * re-applies to its live media elements; SinkAwarePlayer re-routes any live
 * playback context mid-utterance). Idempotent — a no-op when unchanged.
 */
export function setPreferredOutputDeviceId(deviceId: string): void {
  if (state.deviceId === deviceId) return;
  state.deviceId = deviceId;
  for (const l of state.listeners) {
    try {
      l(deviceId);
    } catch {
      // never let a listener break the store
    }
  }
}

/** Subscribe to preferred-output changes. Returns an unsubscribe fn. */
export function subscribeOutputDevice(listener: SinkListener): () => void {
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

/**
 * Apply the current preferred sink to one `HTMLMediaElement`. Feature-detected;
 * on Safari (no `setSinkId`) or "" (system default) it's a clean no-op. A real
 * failure (e.g. the device vanished) is reported loudly, never swallowed — the
 * element keeps playing on the default device.
 */
export async function applySinkToMediaElement(
  el: HTMLMediaElement | null | undefined,
): Promise<void> {
  if (!el) return;
  if (!mediaElementSinkSupported()) return;
  const target = state.deviceId;
  // Empty string is a valid argument to setSinkId meaning "system default".
  const elWithSink = el as HTMLMediaElement & {
    sinkId?: string;
    setSinkId?: (id: string) => Promise<void>;
  };
  if (elWithSink.sinkId === target) return; // already routed
  try {
    await elWithSink.setSinkId?.(target);
  } catch (err) {

    console.error(
      "[audioOutputSink] setSinkId on media element failed — falling back to " +
        "the system default device. Requested device may be unavailable.",
      { deviceId: target, error: err },
    );
  }
}
