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

/**
 * Why the mic stopped being usable mid-hold. `ended` = the OS killed the track
 * (iOS interruption: lock screen, incoming call, app switch, device unplug) —
 * the warm grant is gone and the next acquire WILL re-prompt. `muted` /
 * `unmuted` = a transient interruption (iOS mutes during a call, unmutes after)
 * — the grant survives, no re-prompt. `permission-revoked` = the user/OS pulled
 * the permission. Every one of these used to be silent; they are now reported
 * loudly so a recording surface can react instead of just dropping audio.
 */
export type MicInterruptionReason =
  | "ended"
  | "muted"
  | "unmuted"
  | "permission-revoked";

type InterruptionListener = (reason: MicInterruptionReason) => void;
const interruptionListeners = new Set<InterruptionListener>();

function emitInterruption(reason: MicInterruptionReason): void {
  for (const l of interruptionListeners) {
    try {
      l(reason);
    } catch {
      // never let a listener break the manager
    }
  }
}

/**
 * Subscribe to mic interruptions (track end / mute / permission loss). Returns
 * an unsubscribe fn. Surfaces are expected to make these LOUD — an interruption
 * during a recording is a real event the user must see, not a silent drop.
 */
export function subscribeMicInterruption(
  listener: InterruptionListener,
): () => void {
  interruptionListeners.add(listener);
  return () => {
    interruptionListeners.delete(listener);
  };
}

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

/**
 * Watch the live tracks for OS-level interruptions. iOS fires these on lock,
 * incoming calls, app switches, and device changes — previously unhandled, so
 * the warm stream silently died and the next recording re-prompted with no
 * explanation. We report each one loudly; on a hard `ended` we drop the dead
 * warm stream so the next `acquireMicStream` re-acquires a live one.
 */
function attachTrackHealth(stream: MediaStream): void {
  for (const track of stream.getAudioTracks()) {
    track.onended = () => {
      // eslint-disable-next-line no-console
      console.error(
        "[micStream] mic track ENDED (OS interruption / device change). The " +
          "warm grant is gone; the next recording will re-prompt.",
      );
      if (m.stream === stream) {
        m.stream = null;
        setState("error");
      }
      emitInterruption("ended");
    };
    track.onmute = () => {
      // eslint-disable-next-line no-console
      console.warn(
        "[micStream] mic track MUTED (transient interruption — e.g. a call). " +
          "The grant survives; it should unmute when the interruption ends.",
      );
      emitInterruption("muted");
    };
    track.onunmute = () => {
      emitInterruption("unmuted");
    };
  }
}

// Permission watcher — set up once. When the OS/user revokes mic permission
// mid-session, scream so a recording surface can stop cleanly instead of
// silently failing on the next acquire.
let permissionWatched = false;
function watchPermission(): void {
  if (permissionWatched) return;
  if (typeof navigator === "undefined" || !navigator.permissions) return;
  permissionWatched = true;
  navigator.permissions
    .query({ name: "microphone" as PermissionName })
    .then((status) => {
      status.onchange = () => {
        if (status.state === "denied") {
          // eslint-disable-next-line no-console
          console.error("[micStream] microphone permission REVOKED.");
          hardStop();
          emitInterruption("permission-revoked");
        }
      };
    })
    .catch(() => {
      // Permissions API not supported for microphone (Firefox) — non-fatal.
      permissionWatched = false;
    });
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
      attachTrackHealth(stream);
      watchPermission();
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
