// features/audio/audioContext.ts
//
// ONE shared, resumable AudioContext for analysis taps (the audio-level meter)
// across every recorder instance and tab.
//
// WHY THIS EXISTS
// ---------------
// Each `useChunkedRecordAndTranscribe` instance used to `new AudioContext()` for
// its level-meter analyser, and the Scribe screen mounts several (Record tab,
// ProTextarea, …) alongside the voice-agent's own context. iOS caps the number
// of live AudioContexts (historically ~4-6); churning a fresh one per recording
// risks exhaustion → a recording that silently fails to start. Sharing one
// context that is never closed (only resumed) removes that whole class.
//
// IMPORTANT: capture does NOT depend on this. `MediaRecorder` records straight
// off the `MediaStream`; this context only powers the cosmetic level meter. So
// this is safe to share/keep-warm without any risk to the never-lose-audio path.

import { NO_SINK_ROUTING } from "@/features/audio/audioOutputSink";

let ctx: AudioContext | null = null;

type AudioCtor = typeof AudioContext;

function ctor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext ||
    null
  );
}

/**
 * The shared AudioContext, lazily created (browser only). Returns null when the
 * Web Audio API is unavailable. Never call `.close()` on it — it's shared.
 */
export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx || ctx.state === "closed") {
    const Ctor = ctor();
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      // This context only powers the cosmetic mic-level meter; it must NOT be
      // re-routed to the chosen OUTPUT device by the AudioContext sink patch
      // (that's for playback contexts like Cartesia's WebPlayer).
      (ctx as unknown as Record<string, unknown>)[NO_SINK_ROUTING] = true;
    } catch {
      return null;
    }
  }
  return ctx;
}

/**
 * Resume the shared context. Call from a user gesture (e.g. the record button)
 * — iOS Safari starts contexts "suspended" until a gesture resumes them.
 */
export async function resumeSharedAudioContext(): Promise<void> {
  const c = getSharedAudioContext();
  if (c && c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      // best-effort — the meter just stays flat if this fails
    }
  }
}
