// features/audio/micStream.ts
//
// Shared microphone stream manager — the single place the whole app acquires a
// `getUserMedia` audio stream.
//
// WHY THIS EXISTS
// ---------------
// Every recording surface used to call `navigator.mediaDevices.getUserMedia`
// itself and fully `track.stop()` the stream when it finished. On mobile
// (notably iOS Safari) that produces a permission/“in use” prompt on *every*
// single recording, because the previous grant is torn down before the next
// acquisition. Tapping record three times = three prompts.
//
// This manager keeps ONE stream warm and hands it to every caller. After the
// last holder releases it, the stream is kept alive for a short KEEPALIVE
// window; if another recording starts within that window, the same live
// stream (and the same OS grant) is reused — no second prompt. Only after the
// window elapses with no holders is the stream actually stopped (mic light
// off), so we don't hold the mic open forever.
//
// Reference-counted: concurrent holders (e.g. an analyser tap + a recorder)
// are fine; the stream is only eligible for release when the count hits zero.
//
// Callers MUST NOT call `track.stop()` on the returned stream — that would
// defeat the keepalive and kill it for other holders. Call `releaseMicStream`
// instead.

const DEFAULT_KEEPALIVE_MS = 180_000; // 3 minutes

type Listener = (state: MicStreamState) => void;

export type MicStreamState =
  | "idle"
  | "acquiring"
  | "active"
  | "keepalive"
  | "error";

interface ManagerInternal {
  stream: MediaStream | null;
  inFlight: Promise<MediaStream> | null;
  refCount: number;
  releaseTimer: ReturnType<typeof setTimeout> | null;
  state: MicStreamState;
  keepAliveMs: number;
}

const m: ManagerInternal = {
  stream: null,
  inFlight: null,
  refCount: 0,
  releaseTimer: null,
  state: "idle",
  keepAliveMs: DEFAULT_KEEPALIVE_MS,
};

const listeners = new Set<Listener>();

function setState(next: MicStreamState): void {
  m.state = next;
  for (const l of listeners) {
    try {
      l(next);
    } catch {
      // never let a listener break the manager
    }
  }
}

function clearReleaseTimer(): void {
  if (m.releaseTimer) {
    clearTimeout(m.releaseTimer);
    m.releaseTimer = null;
  }
}

/** True if the warm stream still has at least one live, unmuted-able audio track. */
function streamIsLive(stream: MediaStream | null): stream is MediaStream {
  if (!stream) return false;
  const tracks = stream.getAudioTracks();
  return tracks.length > 0 && tracks.every((t) => t.readyState === "live");
}

/**
 * Acquire the shared mic stream, incrementing the holder count. The returned
 * stream is shared — DO NOT stop its tracks. Call `releaseMicStream()` when
 * done. If a warm stream exists (active or in its keepalive window) it is
 * reused with no new permission prompt.
 */
export async function acquireMicStream(
  constraints?: MediaTrackConstraints,
): Promise<MediaStream> {
  clearReleaseTimer();
  m.refCount += 1;

  // Reuse a still-live warm stream — the whole point of this manager.
  if (streamIsLive(m.stream)) {
    setState("active");
    return m.stream;
  }

  // A previous warm stream died (device unplugged, OS revoke) — drop it.
  m.stream = null;

  if (m.inFlight) {
    // Coalesce concurrent acquisitions onto the same getUserMedia call.
    return m.inFlight;
  }

  setState("acquiring");
  const audio: MediaTrackConstraints = constraints ?? {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  m.inFlight = (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      m.stream = stream;
      setState("active");
      return stream;
    } catch (err) {
      // Acquisition failed — this holder doesn't actually hold anything.
      m.refCount = Math.max(0, m.refCount - 1);
      setState("error");
      throw err;
    } finally {
      m.inFlight = null;
    }
  })();

  return m.inFlight;
}

/**
 * Release a previously-acquired hold. When the last holder releases, the
 * stream is kept warm for the keepalive window, then actually stopped.
 */
export function releaseMicStream(): void {
  m.refCount = Math.max(0, m.refCount - 1);
  if (m.refCount > 0) return;

  if (!m.stream) {
    setState("idle");
    return;
  }

  clearReleaseTimer();
  setState("keepalive");
  m.releaseTimer = setTimeout(() => {
    m.releaseTimer = null;
    // Re-check: a holder may have re-acquired during the window.
    if (m.refCount > 0) return;
    hardStop();
  }, m.keepAliveMs);
}

/**
 * Immediately stop the warm stream regardless of keepalive. Use only when the
 * mic must be released NOW (e.g. explicit "release microphone" affordance);
 * normal teardown should use `releaseMicStream()`.
 */
export function hardStop(): void {
  clearReleaseTimer();
  if (m.stream) {
    for (const t of m.stream.getTracks()) {
      try {
        t.stop();
      } catch {
        // ignore
      }
    }
    m.stream = null;
  }
  m.refCount = 0;
  setState("idle");
}

export function getMicStreamState(): MicStreamState {
  return m.state;
}

export function subscribeMicStream(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Diagnostics snapshot for debug panels. */
export function micStreamDebug(): {
  state: MicStreamState;
  refCount: number;
  live: boolean;
  keepAliveMs: number;
} {
  return {
    state: m.state,
    refCount: m.refCount,
    live: streamIsLive(m.stream),
    keepAliveMs: m.keepAliveMs,
  };
}
