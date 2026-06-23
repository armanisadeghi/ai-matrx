// features/audio/audioOutputSink.ts
//
// Universal audio OUTPUT (speaker) routing — the single place the app decides
// which physical output device every sound plays through.
//
// WHY THIS EXISTS
// ---------------
// Two unrelated playback paths exist: real `HTMLMediaElement`s (`<audio>` /
// `<video>` via `InlineMediaRef`) and the Cartesia TTS `WebPlayer` (a private
// `AudioContext` we can't reach). The browser exposes TWO sink APIs for these:
//
//   • `HTMLMediaElement.setSinkId(deviceId)` — Chrome/Firefox; routes one media
//     element. Used directly by `InlineMediaRef`.
//   • `AudioContext.setSinkId(deviceId)` — Chromium-only; routes a Web Audio
//     graph. The Cartesia `WebPlayer` builds (and discards, per utterance) a
//     hard-private `AudioContext` with no accessible handle, so we cannot call
//     this on it directly. Instead `installAudioContextSinkRouting()` patches
//     the `AudioContext` constructor so EVERY newly-created context inherits the
//     current preferred sink — except contexts that opt out (the mic-analysis
//     meter and the voice-agent capture keep-alive, which are silent or
//     input-only and must not be re-routed).
//
// SAFARI has NEITHER API. Everything here feature-detects and no-ops gracefully;
// on Safari the user picks the output device in macOS/iOS settings.
//
// One store, one subscribe channel, two appliers. The audio-devices manager is
// the only writer (`setPreferredOutputDeviceId`); InlineMediaRef + the Cartesia
// host are the readers.

/** Sentinel marking an AudioContext that must NOT be auto-routed to the
 *  preferred sink (mic-analysis meter, capture keep-alive). Set it on the
 *  context instance right after construction. */
export const NO_SINK_ROUTING = "__matrxNoSinkRouting" as const;

type SinkListener = (deviceId: string) => void;

interface SinkState {
  /** Current preferred output deviceId. "" = system default. */
  deviceId: string;
  listeners: Set<SinkListener>;
  /** Whether the AudioContext constructor patch has been installed. */
  ctxPatched: boolean;
}

const state: SinkState = {
  deviceId: "",
  listeners: new Set(),
  ctxPatched: false,
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
 * re-applies to its live media elements; the AudioContext patch picks it up for
 * the next context). Idempotent — a no-op when unchanged.
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

/**
 * Install a one-time patch on the `AudioContext` constructor so every new
 * context inherits the current preferred sink. This is the ONLY way to route
 * the Cartesia `WebPlayer`'s private, per-utterance context (Chromium only).
 *
 * Contexts created by the mic-analysis meter / voice-agent capture mark
 * themselves with `(ctx as any)[NO_SINK_ROUTING] = true` immediately after
 * construction and are skipped. Safe to call repeatedly — installs once.
 */
export function installAudioContextSinkRouting(): void {
  if (state.ctxPatched) return;
  if (typeof window === "undefined") return;
  if (!audioContextSinkSupported()) return; // Safari/Firefox: nothing to patch
  state.ctxPatched = true;

  const patch = (CtorName: "AudioContext" | "webkitAudioContext") => {
    const w = window as unknown as Record<string, unknown>;
    const Original = w[CtorName] as
      | (new (...args: unknown[]) => AudioContext)
      | undefined;
    if (typeof Original !== "function") return;
    if ((Original as { __matrxSinkPatched?: boolean }).__matrxSinkPatched) {
      return;
    }

    const Patched = function (
      this: unknown,
      ...args: unknown[]
    ): AudioContext {
      const instance = new Original(...args);
      // Defer one microtask so the creator can set NO_SINK_ROUTING first.
      queueMicrotask(() => {
        const marked = (instance as unknown as Record<string, unknown>)[
          NO_SINK_ROUTING
        ];
        if (marked) return;
        const target = state.deviceId;
        if (!target) return; // system default — leave the context alone
        const ctxWithSink = instance as AudioContext & {
          setSinkId?: (id: string) => Promise<void>;
        };
        ctxWithSink.setSinkId?.(target).catch((err: unknown) => {
           
          console.error(
            "[audioOutputSink] setSinkId on AudioContext failed — output stays " +
              "on the system default device.",
            { deviceId: target, error: err },
          );
        });
      });
      return instance;
    } as unknown as new (...args: unknown[]) => AudioContext;

    // Preserve prototype + statics so instanceof and feature-detects survive.
    Patched.prototype = Original.prototype;
    Object.setPrototypeOf(Patched, Original);
    (Patched as { __matrxSinkPatched?: boolean }).__matrxSinkPatched = true;
    w[CtorName] = Patched;
  };

  patch("AudioContext");
  if (
    (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext
  ) {
    patch("webkitAudioContext");
  }
}
