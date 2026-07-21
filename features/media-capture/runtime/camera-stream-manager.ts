// features/media-capture/runtime/camera-stream-manager.ts
//
// Shared camera stream manager — the ONE legal `getUserMedia({video})` call
// site in the repo (the camera twin of `features/audio/micStream.ts`, enforced
// by the ESLint `getUserMedia({video})` chokepoint ban in eslint.config.mjs).
// Framework-free: no React, no Redux — React surfaces subscribe via
// `subscribeCameraStream` / `useSyncExternalStore`.
//
// LEASE MODEL + COMPATIBILITY POLICY
// ----------------------------------
// Callers acquire ref-counted LEASES (`acquireCameraLease(spec)`), each
// declaring `{deviceId?, facingMode?, profile}`:
//
//   • COMPATIBLE leases (equal deviceId + facingMode + profile after
//     preference resolution) SHARE the one live stream — one physical camera
//     acquisition, refcounted.
//   • An INCOMPATIBLE request while leases are live:
//       – if NO recording is pinned → the manager REACQUIRES at the new spec
//         (new getUserMedia, old tracks stopped) and notifies every existing
//         leaseholder via its `"reconfigured"` event with the new stream. A
//         lease NEVER silently keeps a dead/wrong-spec stream.
//       – if a recording IS pinned (`pinForRecording`) → the request is
//         REJECTED with a typed `CameraBusyError` carrying the pin owner's
//         label. Nothing about the live stream changes.
//   • The manager never hands out a stream that does not match the requested
//     spec — it is reacquire-or-busy, never silent mismatch.
//
// LIFECYCLE
// ---------
// The camera stops IMMEDIATELY when the last lease releases — all tracks
// stopped, state cleared. NO keepalive (unlike the mic): a lit camera light
// with no consumer is never acceptable (plan §5 invariant 4). No boot-time
// prompt, ever — acquisition only happens inside `acquireCameraLease`.
//
// Preferred device/facing comes from an INJECTED resolver
// (`setPreferredCameraResolver`) — preferences live in Redux, which this
// framework-free module must not import (Phase 4 wires the resolver). Applied
// lazily on the next acquire only, and only for spec fields the caller left
// undefined.
//
// Track health (`ended`/`mute`/`unmute`) and permission revocation are
// reported loudly on the interruption channel; a `pagehide` backstop screams
// if leases leaked and hard-stops the camera. Real getUserMedia outcomes feed
// the device manager via `noteCameraPermissionOutcome` (the Safari permission
// inference input), and `installCameraPermissionAcquirer()` registers the
// label-unlock acquirer with the device manager — an EXPLICIT install called
// by the provider layer, never an import side effect.

import {
  noteCameraPermissionOutcome,
  registerCameraPermissionAcquirer,
} from "@/features/media-devices/deviceManager";
import type { CaptureQualityProfile } from "@/features/media-capture/core/capture-types";
import {
  buildVideoConstraints,
  summarizeTrackState,
  type TrackStateSummary,
  type VideoConstraintRequest,
} from "@/features/media-capture/core/constraints";

// ─── Public types ────────────────────────────────────────────────────────────

export interface CameraLeaseSpec {
  deviceId?: string;
  facingMode?: "user" | "environment";
  profile: CaptureQualityProfile;
}

/** Fired to a lease when the shared stream was reacquired at a different spec
 *  (an incompatible acquire won while nothing was pinned). Holders MUST swap
 *  to the new stream — the old one's tracks are already stopped. */
export type CameraLeaseEvent = "reconfigured";
export type CameraLeaseListener = (stream: MediaStream) => void;

export interface CameraLease {
  readonly id: string;
  /** The CURRENT live shared stream (tracks are shared — never call
   *  `track.stop()`; release the lease instead). Re-read after a
   *  "reconfigured" event. */
  readonly stream: MediaStream;
  /** Requested vs capability vs effective settings for the live video track
   *  (null once the lease is released or the stream died). */
  getTrackSummary(): TrackStateSummary | null;
  /** Subscribe to lease events ("reconfigured"). Returns an unsubscribe fn. */
  on(event: CameraLeaseEvent, listener: CameraLeaseListener): () => void;
  /** Release this hold. When the LAST lease releases, the camera stops
   *  immediately. Idempotent. */
  release(): void;
}

export type CameraInterruptionReason =
  | "ended"
  | "muted"
  | "unmuted"
  | "permission-revoked";

export type CameraStreamState =
  | "idle"
  | "acquiring"
  | "active"
  | "error";

export interface CameraStreamSnapshot {
  state: CameraStreamState;
  leaseCount: number;
  /** Label of the recording owner currently pinning the camera, or null. */
  pinnedBy: string | null;
  /** The spec the live stream was acquired with (post-preference resolution). */
  activeSpec: CameraLeaseSpec | null;
}

/** Thrown when an incompatible acquire / reconfigure is blocked by a pinned
 *  recording. `pinOwner` is the label passed to `pinForRecording` — surfaces
 *  show it so the block is always explained, never silent. */
export class CameraBusyError extends Error {
  readonly pinOwner: string;
  constructor(pinOwner: string, requested: CameraLeaseSpec) {
    super(
      `Camera is pinned by an active recording ("${pinOwner}") — device/facing/` +
        `profile changes are blocked until it finishes. Requested: ` +
        `${describeSpec(requested)}.`,
    );
    this.name = "CameraBusyError";
    this.pinOwner = pinOwner;
  }
}

// ─── Internals ───────────────────────────────────────────────────────────────

interface LeaseInternal {
  id: string;
  listeners: Set<CameraLeaseListener>;
  released: boolean;
}

interface ManagerInternal {
  stream: MediaStream | null;
  /** Spec of the live/in-flight stream (post-resolution). */
  activeSpec: CameraLeaseSpec | null;
  /** Constraints the live stream was requested with (for summaries). */
  requestedConstraints: MediaTrackConstraints | null;
  /** In-flight getUserMedia, coalesced for COMPATIBLE concurrent acquires. */
  inFlight: Promise<MediaStream> | null;
  leases: Map<string, LeaseInternal>;
  state: CameraStreamState;
  pinnedBy: string | null;
  pinnedLeaseId: string | null;
  pageLifecycleWatched: boolean;
}

const m: ManagerInternal = {
  stream: null,
  activeSpec: null,
  requestedConstraints: null,
  inFlight: null,
  leases: new Map(),
  state: "idle",
  pinnedBy: null,
  pinnedLeaseId: null,
  pageLifecycleWatched: false,
};

let leaseSeq = 0;

type StreamListener = (snapshot: CameraStreamSnapshot) => void;
const streamListeners = new Set<StreamListener>();

type InterruptionListener = (reason: CameraInterruptionReason) => void;
const interruptionListeners = new Set<InterruptionListener>();

/** Preferred device/facing resolver — injected by the provider layer (Phase 4
 *  wires it to Redux preferences). Applied on the NEXT acquire only, and only
 *  for fields the caller's spec leaves undefined. */
export interface PreferredCameraSelection {
  deviceId: string | null;
  facingMode: "user" | "environment" | null;
}
type PreferredCameraResolver = () => PreferredCameraSelection;
let preferredCameraResolver: PreferredCameraResolver | null = null;

export function setPreferredCameraResolver(
  fn: PreferredCameraResolver | null,
): void {
  preferredCameraResolver = fn;
}

function describeSpec(spec: CameraLeaseSpec): string {
  return `{device: ${spec.deviceId ?? "auto"}, facing: ${spec.facingMode ?? "auto"}, profile: ${spec.profile}}`;
}

// Referentially-stable snapshot (useSyncExternalStore discipline — same as
// deviceManager/micStream: recompute ONLY on mutation, via emit()).
let cachedSnapshot: CameraStreamSnapshot = {
  state: m.state,
  leaseCount: 0,
  pinnedBy: null,
  activeSpec: null,
};

function emit(): void {
  cachedSnapshot = {
    state: m.state,
    leaseCount: m.leases.size,
    pinnedBy: m.pinnedBy,
    activeSpec: m.activeSpec,
  };
  for (const l of streamListeners) {
    try {
      l(cachedSnapshot);
    } catch {
      // never let a listener break the manager
    }
  }
}

function setState(next: CameraStreamState): void {
  if (m.state === next) return;
  m.state = next;
  emit();
}

function emitInterruption(reason: CameraInterruptionReason): void {
  for (const l of interruptionListeners) {
    try {
      l(reason);
    } catch {
      // never let a listener break the manager
    }
  }
}

/** Resolve the effective spec: caller fields win; undefined fields fall back
 *  to the injected preference (lazily, at acquire time). */
function resolveSpec(spec: CameraLeaseSpec): CameraLeaseSpec {
  const pref = preferredCameraResolver ? preferredCameraResolver() : null;
  const resolved: CameraLeaseSpec = { profile: spec.profile };
  const deviceId = spec.deviceId ?? pref?.deviceId ?? undefined;
  const facingMode = spec.facingMode ?? pref?.facingMode ?? undefined;
  if (deviceId) resolved.deviceId = deviceId;
  if (facingMode) resolved.facingMode = facingMode;
  return resolved;
}

function specsCompatible(a: CameraLeaseSpec, b: CameraLeaseSpec): boolean {
  return (
    (a.deviceId ?? null) === (b.deviceId ?? null) &&
    (a.facingMode ?? null) === (b.facingMode ?? null) &&
    a.profile === b.profile
  );
}

function streamIsLive(stream: MediaStream | null): stream is MediaStream {
  if (!stream) return false;
  const tracks = stream.getVideoTracks();
  return tracks.length > 0 && tracks.every((t) => t.readyState === "live");
}

function stopStreamTracks(stream: MediaStream): void {
  for (const t of stream.getTracks()) {
    try {
      t.stop();
    } catch {
      // ignore
    }
  }
}

/**
 * Watch the live video track for OS-level interruptions. On a hard `ended`
 * (device unplugged, OS revoke, another app grabbed the camera) the stream is
 * dead — we clear state loudly so the next acquire reacquires; leaseholders
 * hear "ended" on the interruption channel and must release/re-acquire.
 */
function attachTrackHealth(stream: MediaStream): void {
  for (const track of stream.getVideoTracks()) {
    track.onended = () => {
      console.error(
        "[cameraStream] camera track ENDED (device removed / OS interruption). " +
          "The stream is dead — leaseholders must release and re-acquire.",
      );
      if (m.stream === stream) {
        stopStreamTracks(stream);
        m.stream = null;
        m.activeSpec = null;
        m.requestedConstraints = null;
        setState("error");
        emit();
      }
      emitInterruption("ended");
    };
    track.onmute = () => {
      console.warn(
        "[cameraStream] camera track MUTED (transient interruption). The grant " +
          "survives; it should unmute when the interruption ends.",
      );
      emitInterruption("muted");
    };
    track.onunmute = () => {
      emitInterruption("unmuted");
    };
  }
}

// Page-lifecycle backstop — the camera light must NEVER survive the page. If
// this fires with open leases, a surface leaked its release: scream (it is a
// real bug), then hard-stop. Mirrors micStream's pagehide watcher.
function watchPageLifecycle(): void {
  if (m.pageLifecycleWatched) return;
  if (typeof window === "undefined") return;
  m.pageLifecycleWatched = true;
  window.addEventListener("pagehide", () => {
    if (m.stream || m.leases.size > 0) {
      if (m.leases.size > 0) {
        console.error(
          `[cameraStream] page hiding with ${m.leases.size} unreleased camera ` +
            "lease(s) — forcing shutdown. A surface leaked acquireCameraLease " +
            "without a matching release() on unmount.",
        );
      }
      hardStopCamera();
    }
  });
}

/** The one real acquisition. Reports the outcome to the device manager
 *  (Safari permission inference) — grant on success, denial ONLY for
 *  NotAllowedError/SecurityError (a missing device is not a denial). */
async function performGetUserMedia(
  constraints: MediaTrackConstraints,
): Promise<MediaStream> {
  try {
    // The ONE legal getUserMedia({video}) in the repo (see file header).
    const stream = await navigator.mediaDevices.getUserMedia({
      // eslint-disable-next-line no-restricted-syntax -- this IS the camera-stream-manager chokepoint the ban protects
      video: constraints,
    });
    noteCameraPermissionOutcome(true);
    return stream;
  } catch (err) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: unknown }).name)
        : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      noteCameraPermissionOutcome(false);
    }
    throw err;
  }
}

async function acquireStreamForSpec(spec: CameraLeaseSpec): Promise<MediaStream> {
  const request: VideoConstraintRequest = {
    profile: spec.profile,
    ...(spec.deviceId ? { deviceId: spec.deviceId } : {}),
    ...(spec.facingMode ? { facingMode: spec.facingMode } : {}),
  };
  const constraints = buildVideoConstraints(request);
  setState("acquiring");
  const inFlight = (async () => {
    try {
      const stream = await performGetUserMedia(constraints);
      m.stream = stream;
      m.activeSpec = spec;
      m.requestedConstraints = constraints;
      attachTrackHealth(stream);
      watchPageLifecycle();
      setState("active");
      emit();
      return stream;
    } catch (err) {
      setState(m.leases.size > 0 && streamIsLive(m.stream) ? "active" : "error");
      throw err;
    } finally {
      m.inFlight = null;
    }
  })();
  m.inFlight = inFlight;
  return inFlight;
}

function notifyReconfigured(stream: MediaStream): void {
  for (const lease of m.leases.values()) {
    for (const l of lease.listeners) {
      try {
        l(stream);
      } catch {
        // never let a listener break the manager
      }
    }
  }
}

function hardStopCamera(): void {
  if (m.stream) {
    stopStreamTracks(m.stream);
  }
  m.stream = null;
  m.activeSpec = null;
  m.requestedConstraints = null;
  m.leases.clear();
  m.pinnedBy = null;
  m.pinnedLeaseId = null;
  setState("idle");
  emit();
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Acquire a camera lease. Compatible with the live stream → shares it
 * (refcount). Incompatible → reacquire-or-busy per the header policy. Rejects
 * with `CameraBusyError` when a pinned recording blocks the change, or with
 * the underlying getUserMedia error (NotAllowedError etc.) on failure.
 */
export async function acquireCameraLease(
  spec: CameraLeaseSpec,
): Promise<CameraLease> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    throw new Error(
      "[cameraStream] mediaDevices unavailable — camera capture is not supported here.",
    );
  }

  const resolved = resolveSpec(spec);

  // A pinned recording blocks any incompatible acquisition — typed, explained.
  if (
    m.pinnedBy !== null &&
    m.activeSpec !== null &&
    !specsCompatible(m.activeSpec, resolved)
  ) {
    throw new CameraBusyError(m.pinnedBy, resolved);
  }

  const lease: LeaseInternal = {
    id: `cam-lease-${++leaseSeq}`,
    listeners: new Set(),
    released: false,
  };

  if (streamIsLive(m.stream) && m.activeSpec) {
    if (!specsCompatible(m.activeSpec, resolved)) {
      // Incompatible + not pinned → reacquire at the new spec and tell every
      // existing holder. Never silently hand out a wrong-spec stream.
      const old = m.stream;
      const next = await acquireStreamForSpec(resolved);
      stopStreamTracks(old);
      notifyReconfigured(next);
    }
    // else: compatible — share the live stream as-is.
  } else if (m.inFlight && m.activeSpec && specsCompatible(m.activeSpec, resolved)) {
    // Coalesce onto the compatible in-flight acquisition.
    await m.inFlight;
  } else {
    await acquireStreamForSpec(resolved);
  }

  m.leases.set(lease.id, lease);
  emit();

  const publicLease: CameraLease = {
    id: lease.id,
    get stream(): MediaStream {
      if (!m.stream) {
        throw new Error(
          "[cameraStream] lease has no live stream (released or ended) — " +
            "re-acquire before use.",
        );
      }
      return m.stream;
    },
    getTrackSummary(): TrackStateSummary | null {
      if (lease.released || !streamIsLive(m.stream) || !m.requestedConstraints) {
        return null;
      }
      const track = m.stream.getVideoTracks()[0];
      if (!track) return null;
      const capabilities =
        typeof track.getCapabilities === "function"
          ? track.getCapabilities()
          : null;
      return summarizeTrackState(
        m.requestedConstraints,
        capabilities,
        track.getSettings(),
      );
    },
    on(event: CameraLeaseEvent, listener: CameraLeaseListener): () => void {
      // Only "reconfigured" exists today; the event arg keeps the surface
      // extensible without a breaking change.
      void event;
      lease.listeners.add(listener);
      return () => {
        lease.listeners.delete(listener);
      };
    },
    release(): void {
      if (lease.released) return;
      lease.released = true;
      lease.listeners.clear();
      m.leases.delete(lease.id);
      if (m.pinnedLeaseId === lease.id) {
        // A recording lease releasing implicitly unpins.
        m.pinnedBy = null;
        m.pinnedLeaseId = null;
      }
      if (m.leases.size === 0) {
        // Last lease out → camera OFF now. No keepalive, ever.
        hardStopCamera();
      } else {
        emit();
      }
    },
  };

  return publicLease;
}

/**
 * Pin the camera for a recording. While pinned, incompatible acquisitions and
 * device/facing/profile changes are rejected with `CameraBusyError` naming
 * `ownerLabel`. Throws if the lease is unknown or another owner already pins.
 */
export function pinForRecording(leaseId: string, ownerLabel: string): void {
  const lease = m.leases.get(leaseId);
  if (!lease) {
    throw new Error(
      `[cameraStream] pinForRecording: unknown or released lease "${leaseId}".`,
    );
  }
  if (m.pinnedBy !== null && m.pinnedLeaseId !== leaseId) {
    throw new CameraBusyError(m.pinnedBy, m.activeSpec ?? { profile: "1080p" });
  }
  m.pinnedBy = ownerLabel;
  m.pinnedLeaseId = leaseId;
  emit();
}

/** Release the recording pin. Idempotent. */
export function unpin(): void {
  if (m.pinnedBy === null) return;
  m.pinnedBy = null;
  m.pinnedLeaseId = null;
  emit();
}

/** Report camera permission revocation (wired by the device layer). Stops the
 *  stream NOW and emits a loud interruption. */
export function notifyCameraPermissionRevoked(): void {
  console.error("[cameraStream] camera permission REVOKED.");
  hardStopCamera();
  emitInterruption("permission-revoked");
}

/** Subscribe to camera interruptions (ended/mute/unmute/permission loss).
 *  Surfaces must make these LOUD. Returns an unsubscribe fn. */
export function subscribeCameraInterruption(
  listener: InterruptionListener,
): () => void {
  interruptionListeners.add(listener);
  return () => {
    interruptionListeners.delete(listener);
  };
}

/** Current referentially-stable snapshot (useSyncExternalStore-safe). */
export function getCameraStreamState(): CameraStreamSnapshot {
  return cachedSnapshot;
}

/** Subscribe to snapshot changes. Returns an unsubscribe fn. */
export function subscribeCameraStream(listener: StreamListener): () => void {
  streamListeners.add(listener);
  return () => {
    streamListeners.delete(listener);
  };
}

/** Diagnostics snapshot for debug panels / the future /camera/admin map. */
export function cameraStreamDebug(): {
  state: CameraStreamState;
  leaseCount: number;
  live: boolean;
  pinnedBy: string | null;
  activeSpec: CameraLeaseSpec | null;
} {
  return {
    state: m.state,
    leaseCount: m.leases.size,
    live: streamIsLive(m.stream),
    pinnedBy: m.pinnedBy,
    activeSpec: m.activeSpec,
  };
}

/**
 * Register this manager as the device manager's camera-permission acquirer:
 * a minimal acquire + immediate release that unlocks `enumerateDevices` labels
 * and reports the real outcome via `noteCameraPermissionOutcome` (inside
 * `performGetUserMedia`). EXPLICIT install — called once by the provider
 * layer (Phase 4), NEVER an import side effect, so importing this module can
 * never wire anything at boot. Idempotent.
 */
export function installCameraPermissionAcquirer(): void {
  registerCameraPermissionAcquirer(async () => {
    const lease = await acquireCameraLease({ profile: "720p" });
    lease.release();
  });
}
