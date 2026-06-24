// features/audio/audioDevices.ts
//
// THE canonical audio-device + permission manager — framework-free, one
// singleton, the single source of truth for "what mic / speaker is selected and
// is the mic permission granted". The React surface is `useAudioDevices`.
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
//     `navigator.permissions.query({name:'microphone'})` is reliable there
//     (we cache it + subscribe to `permissionchange`). Safari is unreliable —
//     `query` may report "prompt" even when denied — so on Safari we SKIP the
//     query and infer state from the getUserMedia result. We NEVER re-prompt
//     when already granted.
//   • Device IDs: we store BOTH `deviceId` AND `label`. On resolve we match by
//     id → else by label → else system default. iOS Safari regenerates
//     `deviceId` every load, so the label fallback is mandatory. We subscribe to
//     `devicechange` to refresh the list.
//   • Output (speaker): `setSinkId` works in Chrome/Firefox but not Safari — see
//     `audioOutputSink.ts`. We feature-detect via `outputSelectionSupported()`.
//
// PERMISSION UNLOCK reuses the warm mic singleton (`micStream.ts`): a single
// `acquireMicStream()` + immediate `releaseMicStream()` both unlocks labels AND
// leaves the grant warm (the manager keeps the mic-light off via its short
// keepalive). No throwaway second `getUserMedia` that fights the singleton.

import {
  acquireMicStream,
  releaseMicStream,
  setPreferredInputDeviceId,
  notifyMicPermissionRevoked,
} from "@/features/audio/micStream";
import { setPreferredOutputDeviceId } from "@/features/audio/audioOutputSink";

export type AudioPermissionState = "granted" | "denied" | "prompt" | "unknown";

export interface AudioDeviceInfo {
  deviceId: string;
  /** Human label — blank until permission is granted. */
  label: string;
  groupId: string;
}

export interface AudioDevicesSnapshot {
  permissionState: AudioPermissionState;
  inputs: AudioDeviceInfo[];
  outputs: AudioDeviceInfo[];
}

type DevicesListener = (snapshot: AudioDevicesSnapshot) => void;

interface ManagerInternal {
  permissionState: AudioPermissionState;
  inputs: AudioDeviceInfo[];
  outputs: AudioDeviceInfo[];
  listeners: Set<DevicesListener>;
  /** Cached `permissions.query` result so we don't re-query (Chrome). */
  permissionStatus: PermissionStatus | null;
  /** in-flight permission request, coalesced. */
  ensuring: Promise<AudioPermissionState> | null;
  /** in-flight enumerate, coalesced. */
  enumerating: Promise<void> | null;
  listenersWired: boolean;
}

const m: ManagerInternal = {
  permissionState: "unknown",
  inputs: [],
  outputs: [],
  listeners: new Set(),
  permissionStatus: null,
  ensuring: null,
  enumerating: null,
  listenersWired: false,
};

// ── Safari detection (its Permissions API for the mic is unreliable) ─────────
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
let cachedSnapshot: AudioDevicesSnapshot = {
  permissionState: m.permissionState,
  inputs: m.inputs,
  outputs: m.outputs,
};

function snapshot(): AudioDevicesSnapshot {
  return cachedSnapshot;
}

function emit(): void {
  cachedSnapshot = {
    permissionState: m.permissionState,
    inputs: m.inputs,
    outputs: m.outputs,
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

function setPermissionState(next: AudioPermissionState): void {
  if (m.permissionState === next) return;
  m.permissionState = next;
  emit();
}

function mapDevices(devices: MediaDeviceInfo[]): {
  inputs: AudioDeviceInfo[];
  outputs: AudioDeviceInfo[];
} {
  const inputs: AudioDeviceInfo[] = [];
  const outputs: AudioDeviceInfo[] = [];
  for (const d of devices) {
    const info: AudioDeviceInfo = {
      deviceId: d.deviceId,
      label: d.label,
      groupId: d.groupId,
    };
    if (d.kind === "audioinput") inputs.push(info);
    else if (d.kind === "audiooutput") outputs.push(info);
  }
  return { inputs, outputs };
}

/**
 * Enumerate audio devices and update the cached lists. Labels are only present
 * once permission is granted — calling this before a grant yields entries with
 * blank labels (still useful to know a device exists). Coalesced so concurrent
 * callers share one enumeration. Never throws — failures are reported + leave
 * the prior list intact.
 */
export async function listDevices(): Promise<AudioDevicesSnapshot> {
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
      const { inputs, outputs } = mapDevices(devices);
      m.inputs = inputs;
      m.outputs = outputs;
      emit();
    } catch (err) {
      console.error("[audioDevices] enumerateDevices failed:", err);
    } finally {
      m.enumerating = null;
    }
  })();
  await m.enumerating;
  return snapshot();
}

/**
 * Read the current permission state without prompting. On Chrome/Firefox this
 * uses the Permissions API (cached + subscribed). On Safari (unreliable) it
 * returns the last inferred state. Returns "unknown" if it can't be determined
 * without a prompt.
 */
export async function queryPermission(): Promise<AudioPermissionState> {
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
    const mapped: AudioPermissionState =
      status.state === "granted"
        ? "granted"
        : status.state === "denied"
          ? "denied"
          : "prompt";
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
    const mapped: AudioPermissionState =
      status.state === "granted"
        ? "granted"
        : status.state === "denied"
          ? "denied"
          : "prompt";
    setPermissionState(mapped);
    // A transition to "granted" unlocks labels — refresh the list.
    if (mapped === "granted") void listDevices();
    // This is the ONE permission watcher for the app. On revoke, stop the warm
    // mic stream NOW and emit a loud interruption so any in-flight recording
    // surface reacts instead of silently failing on its next acquire.
    if (mapped === "denied") notifyMicPermissionRevoked();
  };
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
export async function ensurePermission(): Promise<AudioPermissionState> {
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
      try {
        await acquireMicStream();
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

        console.error("[audioDevices] mic permission request failed:", err);
        // A device may simply be missing; treat as prompt-able again.
        setPermissionState(
          m.permissionState === "granted" ? "granted" : "prompt",
        );
        return m.permissionState;
      } finally {
        releaseMicStream();
      }
    } finally {
      m.ensuring = null;
    }
  })();

  return m.ensuring;
}

/**
 * Wire the global listeners ONCE: `devicechange` (refresh the list) and the
 * Permissions API subscription (already handled in `queryPermission`). Called
 * by the app-root provider on boot. Idempotent.
 */
export function startDeviceListeners(): void {
  if (m.listenersWired) return;
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
  m.listenersWired = true;
  navigator.mediaDevices.addEventListener("devicechange", () => {
    void listDevices();
  });
  // Seed the permission state + an initial (possibly label-less) enumeration so
  // the picker can show device counts before the user grants.
  void queryPermission();
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
 * every media element + the AudioContext patch). "" = system default.
 */
export function applyOutputDevice(deviceId: string): void {
  setPreferredOutputDeviceId(deviceId);
}

/** Current snapshot (for non-React consumers / debug panels). */
export function getAudioDevicesSnapshot(): AudioDevicesSnapshot {
  return snapshot();
}

/** Subscribe to device/permission snapshots. Returns an unsubscribe fn. */
export function subscribeAudioDevices(listener: DevicesListener): () => void {
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
 * deviceId ("" when nothing matches).
 */
export function resolveDeviceId(
  devices: AudioDeviceInfo[],
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
