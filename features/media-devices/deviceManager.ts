// features/media-devices/deviceManager.ts
//
// THE canonical media-device + permission manager — framework-free, one
// singleton, the single source of truth for "what mic / speaker / camera is
// selected and are the mic + camera permissions granted". The React surface is
// `useAudioDevices` (camera hooks arrive with the capture system — see
// docs/media-capture-plan.md). Generalized from the former audio-only device
// manager in Phase 1 of the media capture plan.
//
// WHY THIS EXISTS
// ---------------
// Before this, surfaces couldn't pick a mic/speaker, re-prompted for permission
// on every recording, forgot the chosen device, and leaked Chrome's mic
// indicator. The browser facts this module obeys EXACTLY (a Chrome/Safari
// homework brief drove these):
//
//   • `enumerateDevices()` returns device LABELS only AFTER a permission grant —
//     before that, labels are blank. So we request/confirm permission before
//     showing a populated picker.
//   • Permission persistence: Chrome persists per HTTPS origin and
//     `navigator.permissions.query({name:'microphone'|'camera'})` is reliable
//     there (we cache it + subscribe to `permissionchange`). Safari is
//     unreliable — `query` may report "prompt" even when denied — so on Safari
//     we SKIP the query and infer state from the getUserMedia result. We NEVER
//     re-prompt when already granted.
//   • Device IDs: we store BOTH `deviceId` AND `label`. On resolve we match by
//     id → else by label → else system default. iOS Safari regenerates
//     `deviceId` every load, so the label fallback is mandatory. We subscribe to
//     `devicechange` to refresh the list.
//   • Output (speaker): `setSinkId` works in Chrome/Firefox but not Safari — see
//     `features/audio/audioOutputSink.ts`. Feature-detect via
//     `outputSelectionSupported()`.
//
// ONE ENUMERATOR, ONE `devicechange` LISTENER — never parallel audio/camera
// managers. Cameras (`videoinput`) are enumerated here alongside mic/speaker.
//
// MIC PERMISSION UNLOCK reuses the warm mic singleton (`micStream.ts`): a
// single `acquireMicStream()` + immediate `releaseMicStream()` both unlocks
// labels AND leaves the grant warm. No throwaway second `getUserMedia`.
//
// CAMERA PERMISSION: this module NEVER calls `getUserMedia({video})` — the ONE
// legal call site is the camera stream manager (media-capture Phase 3), which
// registers itself via `registerCameraPermissionAcquirer` and reports outcomes
// via `noteCameraPermissionOutcome` (the Safari inference input). NEVER prompt
// for the camera at app boot.

import {
  acquireMicStream,
  releaseMicStream,
  setPreferredInputDeviceId,
  notifyMicPermissionRevoked,
} from "@/features/audio/micStream";
import { setPreferredOutputDeviceId } from "@/features/audio/audioOutputSink";

export type MediaPermissionState = "granted" | "denied" | "prompt" | "unknown";

export interface MediaDeviceDescriptor {
  deviceId: string;
  /** Human label — blank until permission is granted. */
  label: string;
  groupId: string;
}

export interface MediaDevicesSnapshot {
  /** Microphone permission state. */
  permissionState: MediaPermissionState;
  cameraPermissionState: MediaPermissionState;
  inputs: MediaDeviceDescriptor[];
  outputs: MediaDeviceDescriptor[];
  cameras: MediaDeviceDescriptor[];
}

type DevicesListener = (snapshot: MediaDevicesSnapshot) => void;

interface ManagerInternal {
  permissionState: MediaPermissionState;
  cameraPermissionState: MediaPermissionState;
  inputs: MediaDeviceDescriptor[];
  outputs: MediaDeviceDescriptor[];
  cameras: MediaDeviceDescriptor[];
  listeners: Set<DevicesListener>;
  /** Cached `permissions.query` results so we don't re-query (Chrome). */
  permissionStatus: PermissionStatus | null;
  cameraPermissionStatus: PermissionStatus | null;
  /** in-flight permission requests, coalesced. */
  ensuring: Promise<MediaPermissionState> | null;
  ensuringCamera: Promise<MediaPermissionState> | null;
  /** in-flight enumerate, coalesced. */
  enumerating: Promise<void> | null;
  listenersWired: boolean;
}

const m: ManagerInternal = {
  permissionState: "unknown",
  cameraPermissionState: "unknown",
  inputs: [],
  outputs: [],
  cameras: [],
  listeners: new Set(),
  permissionStatus: null,
  cameraPermissionStatus: null,
  ensuring: null,
  ensuringCamera: null,
  enumerating: null,
  listenersWired: false,
};

// ── Safari detection (its Permissions API for mic/camera is unreliable) ──────
function isSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Real Safari includes "Safari" but not "Chrome"/"Chromium"/"Android".
  return (
    /Safari/.test(ua) && !/Chrome|Chromium|Android|CriOS|FxiOS|EdgiOS/.test(ua)
  );
}

// Cached, referentially-stable snapshot. `useSyncExternalStore` calls
// getSnapshot on every render and bails out only when it returns the SAME
// reference — so we must NOT mint a fresh object each call. We recompute the
// cached object only when the manager actually mutates state (every mutation
// path goes through `emit()`), keeping the reference stable in between. Without
// this, getSnapshot returns a new object every render → React re-renders →
// getSnapshot again → infinite "Maximum update depth exceeded" loop.
let cachedSnapshot: MediaDevicesSnapshot = {
  permissionState: m.permissionState,
  cameraPermissionState: m.cameraPermissionState,
  inputs: m.inputs,
  outputs: m.outputs,
  cameras: m.cameras,
};

function snapshot(): MediaDevicesSnapshot {
  return cachedSnapshot;
}

function emit(): void {
  cachedSnapshot = {
    permissionState: m.permissionState,
    cameraPermissionState: m.cameraPermissionState,
    inputs: m.inputs,
    outputs: m.outputs,
    cameras: m.cameras,
  };
  const snap = cachedSnapshot;
  for (const l of m.listeners) {
    try {
      l(snap);
    } catch {
      // never let a listener break the manager
    }
  }
}

function setPermissionState(next: MediaPermissionState): void {
  if (m.permissionState === next) return;
  m.permissionState = next;
  emit();
}

function setCameraPermissionState(next: MediaPermissionState): void {
  if (m.cameraPermissionState === next) return;
  m.cameraPermissionState = next;
  emit();
}

function mapDevices(devices: MediaDeviceInfo[]): {
  inputs: MediaDeviceDescriptor[];
  outputs: MediaDeviceDescriptor[];
  cameras: MediaDeviceDescriptor[];
} {
  const inputs: MediaDeviceDescriptor[] = [];
  const outputs: MediaDeviceDescriptor[] = [];
  const cameras: MediaDeviceDescriptor[] = [];
  for (const d of devices) {
    const info: MediaDeviceDescriptor = {
      deviceId: d.deviceId,
      label: d.label,
      groupId: d.groupId,
    };
    if (d.kind === "audioinput") inputs.push(info);
    else if (d.kind === "audiooutput") outputs.push(info);
    else if (d.kind === "videoinput") cameras.push(info);
  }
  return { inputs, outputs, cameras };
}

/**
 * Enumerate media devices and update the cached lists. Labels are only present
 * once permission is granted — calling this before a grant yields entries with
 * blank labels (still useful to know a device exists). Coalesced so concurrent
 * callers share one enumeration. Never throws — failures are reported + leave
 * the prior list intact.
 */
export async function listDevices(): Promise<MediaDevicesSnapshot> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return snapshot();
  }
  if (m.enumerating) {
    await m.enumerating;
    return snapshot();
  }
  m.enumerating = (async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const { inputs, outputs, cameras } = mapDevices(devices);
      m.inputs = inputs;
      m.outputs = outputs;
      m.cameras = cameras;
      emit();
    } catch (err) {
      console.error("[mediaDevices] enumerateDevices failed:", err);
    } finally {
      m.enumerating = null;
    }
  })();
  await m.enumerating;
  return snapshot();
}

function mapPermissionStatus(status: PermissionStatus): MediaPermissionState {
  return status.state === "granted"
    ? "granted"
    : status.state === "denied"
      ? "denied"
      : "prompt";
}

/**
 * Read the current MIC permission state without prompting. On Chrome/Firefox
 * this uses the Permissions API (cached + subscribed). On Safari (unreliable)
 * it returns the last inferred state. Returns "unknown" if it can't be
 * determined without a prompt.
 */
export async function queryPermission(): Promise<MediaPermissionState> {
  if (typeof navigator === "undefined") return "unknown";

  // Safari: the Permissions API lies for the microphone. Don't trust query;
  // keep whatever we last inferred from a real getUserMedia result.
  if (isSafari() || !navigator.permissions) {
    return m.permissionState;
  }

  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    m.permissionStatus = status;
    wirePermissionStatus(status);
    const mapped = mapPermissionStatus(status);
    setPermissionState(mapped);
    return mapped;
  } catch {
    // Permissions API doesn't support "microphone" here (older Firefox) —
    // fall back to whatever we last inferred.
    return m.permissionState;
  }
}

function wirePermissionStatus(status: PermissionStatus): void {
  status.onchange = () => {
    const mapped = mapPermissionStatus(status);
    setPermissionState(mapped);
    // A transition to "granted" unlocks labels — refresh the list.
    if (mapped === "granted") void listDevices();
    // This is the ONE mic-permission watcher for the app. On revoke, stop the
    // warm mic stream NOW and emit a loud interruption so any in-flight
    // recording surface reacts instead of silently failing on its next acquire.
    if (mapped === "denied") notifyMicPermissionRevoked();
  };
}

/**
 * Read the current CAMERA permission state without prompting — the exact
 * mirror of `queryPermission`. Chromium: `permissions.query({name:"camera"})`,
 * cached + subscribed. Safari: query skipped; state is whatever the last real
 * camera `getUserMedia` outcome reported via `noteCameraPermissionOutcome`.
 */
export async function queryCameraPermission(): Promise<MediaPermissionState> {
  if (typeof navigator === "undefined") return "unknown";

  if (isSafari() || !navigator.permissions) {
    return m.cameraPermissionState;
  }

  try {
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    m.cameraPermissionStatus = status;
    wireCameraPermissionStatus(status);
    const mapped = mapPermissionStatus(status);
    setCameraPermissionState(mapped);
    return mapped;
  } catch {
    // Permissions API doesn't support "camera" here — keep the inferred state.
    return m.cameraPermissionState;
  }
}

function wireCameraPermissionStatus(status: PermissionStatus): void {
  status.onchange = () => {
    const mapped = mapPermissionStatus(status);
    setCameraPermissionState(mapped);
    // A transition to "granted" unlocks labels — refresh the list.
    if (mapped === "granted") void listDevices();
  };
}

/**
 * Report the outcome of a REAL camera `getUserMedia` call — called by the
 * camera stream manager (the one legal `getUserMedia({video})` site). This is
 * the Safari inference input (its Permissions API is untrusted) and keeps
 * Chromium in sync between permissionchange events. Also refreshes the device
 * list on a grant (labels unlock).
 */
export function noteCameraPermissionOutcome(granted: boolean): void {
  setCameraPermissionState(granted ? "granted" : "denied");
  if (granted) void listDevices();
}

/**
 * The camera stream manager (media-capture Phase 3) registers its acquirer
 * here. The acquirer must perform a real, immediately-released camera stream
 * acquisition (or reuse a live lease) and report the outcome via
 * `noteCameraPermissionOutcome`. This module NEVER calls
 * `getUserMedia({video})` itself.
 */
type CameraPermissionAcquirer = () => Promise<void>;
let cameraPermissionAcquirer: CameraPermissionAcquirer | null = null;

export function registerCameraPermissionAcquirer(
  fn: CameraPermissionAcquirer,
): void {
  cameraPermissionAcquirer = fn;
}

/**
 * Ensure CAMERA permission, prompting ONLY if needed — the camera twin of
 * `ensurePermission`. Delegates actual stream acquisition to the registered
 * camera stream manager; throws loudly if none is registered (it is NOT
 * installed until media-capture Phase 3). NEVER called at app boot.
 */
export async function ensureCameraPermission(): Promise<MediaPermissionState> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return "unknown";
  }
  if (m.ensuringCamera) return m.ensuringCamera;

  m.ensuringCamera = (async () => {
    try {
      // Cheap path: if a reliable query already says "granted", don't prompt.
      const queried = await queryCameraPermission();
      if (queried === "granted") {
        await listDevices();
        return "granted";
      }

      if (!cameraPermissionAcquirer) {
        throw new Error(
          "[mediaDevices] ensureCameraPermission: no camera stream manager is " +
            "registered (registerCameraPermissionAcquirer). The camera stream " +
            "manager is not yet installed (media-capture Phase 3) — this " +
            "module never calls getUserMedia({video}) itself.",
        );
      }

      // The acquirer performs the real getUserMedia and reports the outcome
      // via noteCameraPermissionOutcome; a rejection means denial/failure.
      try {
        await cameraPermissionAcquirer();
      } catch (err) {
        const name =
          err && typeof err === "object" && "name" in err
            ? String((err as { name: unknown }).name)
            : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setCameraPermissionState("denied");
          return "denied";
        }
        console.error(
          "[mediaDevices] camera permission request failed:",
          err,
        );
        setCameraPermissionState(
          m.cameraPermissionState === "granted" ? "granted" : "prompt",
        );
        return m.cameraPermissionState;
      }
      return m.cameraPermissionState;
    } finally {
      m.ensuringCamera = null;
    }
  })();

  return m.ensuringCamera;
}

/**
 * Ensure microphone permission, prompting ONLY if needed. If already granted
 * (per a reliable query, or a prior grant this session) it does NOT re-prompt —
 * it just refreshes the device list (labels now available) and returns.
 *
 * The unlock reuses the warm mic singleton: one `acquireMicStream()` +
 * immediate `releaseMicStream()`. That unlocks `enumerateDevices` labels and
 * leaves the grant warm; the singleton's short keepalive clears the mic light
 * promptly. Coalesced across concurrent callers.
 */
export async function ensurePermission(): Promise<MediaPermissionState> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return "unknown";
  }
  if (m.ensuring) return m.ensuring;

  m.ensuring = (async () => {
    try {
      // Cheap path: if a reliable query already says "granted", don't prompt.
      const queried = await queryPermission();
      if (queried === "granted") {
        await listDevices();
        return "granted";
      }

      // Prompt (or confirm a deny) via the singleton. Acquire unlocks labels;
      // release returns the hold so the mic light clears on the keepalive.
      // NOTE: a FAILED acquire has already decremented its own refcount inside
      // the manager — releasing again in `finally` would unbalance the count
      // and steal a live recording's hold. Only release what was acquired.
      let acquired = false;
      try {
        await acquireMicStream();
        acquired = true;
        setPermissionState("granted");
        await listDevices();
        return "granted";
      } catch (err) {
        // NotAllowedError / SecurityError → denied; anything else → unknown but
        // surfaced. Never silently swallow.
        const name =
          err && typeof err === "object" && "name" in err
            ? String((err as { name: unknown }).name)
            : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setPermissionState("denied");
          return "denied";
        }

        console.error("[mediaDevices] mic permission request failed:", err);
        // A device may simply be missing; treat as prompt-able again.
        setPermissionState(
          m.permissionState === "granted" ? "granted" : "prompt",
        );
        return m.permissionState;
      } finally {
        if (acquired) releaseMicStream();
      }
    } finally {
      m.ensuring = null;
    }
  })();

  return m.ensuring;
}

/**
 * Wire the global listeners ONCE: `devicechange` (refresh the list) and the
 * Permissions API subscriptions (mic + camera — handled in the query fns).
 * Called by the app-root provider on boot. Idempotent. Reads permission state
 * WITHOUT prompting — never a camera (or mic) prompt at boot.
 */
export function startDeviceListeners(): void {
  if (m.listenersWired) return;
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
  m.listenersWired = true;
  navigator.mediaDevices.addEventListener("devicechange", () => {
    void listDevices();
  });
  // Seed the permission states + an initial (possibly label-less) enumeration
  // so pickers can show device counts before the user grants.
  void queryPermission();
  void queryCameraPermission();
  void listDevices();
}

/**
 * Apply a chosen INPUT device to the mic singleton AND the preferences-write
 * callback. The manager itself does not own preferences (Redux does) — the hook
 * passes a `persist` writer. This keeps the framework-free module pure while
 * still updating the singleton so the very next recording uses the device.
 */
export function applyInputDevice(deviceId: string): void {
  // "" = system default → clear the singleton preference (falls back to default).
  setPreferredInputDeviceId(deviceId || null);
}

/**
 * Apply a chosen OUTPUT device to the output-sink store (drives `setSinkId` on
 * every media element). "" = system default.
 */
export function applyOutputDevice(deviceId: string): void {
  setPreferredOutputDeviceId(deviceId);
}

/** Current snapshot (for non-React consumers / debug panels). */
export function getMediaDevicesSnapshot(): MediaDevicesSnapshot {
  return snapshot();
}

/** Subscribe to device/permission snapshots. Returns an unsubscribe fn. */
export function subscribeMediaDevices(listener: DevicesListener): () => void {
  m.listeners.add(listener);
  return () => {
    m.listeners.delete(listener);
  };
}

/**
 * Resolve a stored (deviceId, label) preference against the LIVE device list,
 * per the homework rule: match by id → else by label → else "" (system
 * default). iOS Safari regenerates deviceIds each load, so the label fallback
 * is what makes a remembered choice survive a reload. Returns the resolved
 * deviceId ("" when nothing matches). Works for any device kind — mic,
 * speaker, or camera.
 */
export function resolveDeviceId(
  devices: MediaDeviceDescriptor[],
  storedId: string,
  storedLabel: string,
): string {
  if (!storedId && !storedLabel) return "";
  if (storedId) {
    const byId = devices.find((d) => d.deviceId === storedId);
    if (byId) return byId.deviceId;
  }
  if (storedLabel) {
    const byLabel = devices.find((d) => d.label && d.label === storedLabel);
    if (byLabel) return byLabel.deviceId;
  }
  return "";
}
