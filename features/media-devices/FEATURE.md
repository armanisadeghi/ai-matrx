# FEATURE.md — `media-devices`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-07-21`

> Device core for the media capture system. Execution plan: [`docs/media-capture-plan.md`](../../docs/media-capture-plan.md) (Phase 1 of that plan built this feature).

---

## Purpose

The ONE canonical media-device + permission manager — enumeration, permission state, and preference resolution for **microphones, speakers, and cameras**. Framework-free singleton: `deviceManager.ts`. React surfaces consume it via `useSyncExternalStore` (today: `features/audio/useAudioDevices.ts`; camera hooks arrive with `features/media-capture/`).

## What it owns

- `MediaDeviceDescriptor` (`{deviceId, label, groupId}`) and the referentially-stable `MediaDevicesSnapshot` (`permissionState`, `cameraPermissionState`, `inputs`, `outputs`, `cameras`).
- `listDevices()` — the one enumerator (coalesced; splits `audioinput`/`audiooutput`/`videoinput`).
- Mic permission: `queryPermission()` / `ensurePermission()` (unlock via the warm `micStream` singleton; Chromium `permissions.query` trusted + subscribed, Safari inferred from real getUserMedia outcomes; revoke → `notifyMicPermissionRevoked`).
- Camera permission: `queryCameraPermission()` (same Chromium/Safari split) + the injection seam — `registerCameraPermissionAcquirer(fn)` / `ensureCameraPermission()` / `noteCameraPermissionOutcome(granted)`. The camera stream manager (media-capture Phase 3) registers the acquirer and reports outcomes.
- `resolveDeviceId(devices, storedId, storedLabel)` — id → label → system default (iOS regenerates ids per load; the label fallback is load-bearing). Works for every device kind.
- `applyInputDevice` / `applyOutputDevice` — push a choice into the mic singleton / output-sink store. Persisted choice lives in Redux userPreferences, not here.

## Invariants

1. **One enumerator, one `devicechange` listener, app-wide** (`startDeviceListeners()`, idempotent, wired by `providers/AudioDeviceProviderImpl.tsx`). Never build a parallel audio or camera device manager.
2. **Zero `getUserMedia({video})` in this feature.** Camera stream acquisition belongs exclusively to the camera stream manager; this module only receives its outcomes. **Never prompt for the camera at app boot.**
3. **Snapshots are referentially stable** — recomputed only inside `emit()`. `useSyncExternalStore` compares by reference; minting a fresh object per `getSnapshot` causes an infinite render loop. Preserve this when touching any mutation path.
4. Device identity persists as id + label pairs; resolution is id → label → `""` (system default).

## Preference wiring (Phase 4)

- **Persisted choice:** `userPreferences.mediaDevices` (`MediaDevicePreferences` in `lib/redux/preferences/userPreferencesSlice.ts`) — flat id+label pairs for mic/speaker/camera plus `preferredFacingMode` (`"user" | "environment" | ""`); `""` = system default/auto. Superseded the audio-only `audioDevices` module and `videoConference.defaultCamera` (paired backfill: `liftLegacyAudioDevicesToMediaDevices` TS rule + `migrations/user_preferences_media_devices_backfill.sql`).
- **Application:** `providers/AudioDeviceProviderImpl.tsx` applies mic/speaker eagerly (`applyInputDevice`/`applyOutputDevice`) and installs the LAZY camera path: `setPreferredCameraResolver` (resolves stored camera id+label against the live `cameras` list via `resolveDeviceId`, plus the facing preference) and `installCameraPermissionAcquirer()`. The camera is never acquired at boot — the resolver is consulted only inside `acquireCameraLease`.

## Tests

`__tests__/deviceManager.test.ts` — `resolveDeviceId`, snapshot stability, camera splitting (mocked `navigator.mediaDevices`), camera permission seam. Run: `npx jest features/media-devices --no-coverage`.

## Related

- `features/audio/` — mic singleton (`micStream.ts`), output sink (`audioOutputSink.ts`, `sinkAwarePlayer.ts`), capture lock, hook + devices UI panel ([FEATURE.md](../audio/FEATURE.md)).
- `features/media-capture/` — capture core/runtime consuming this (see the plan doc).

## Change log

- `2026-07-21` — Phase 4: `userPreferences.mediaDevices` module (absorbs `audioDevices` + `videoConference.defaultCamera`, paired TS+SQL backfill applied live), provider wires `setPreferredCameraResolver` + `installCameraPermissionAcquirer`, `useAudioDevices` camera surface, `MediaDevicesPanel` camera section, `devices` settings tab.
- `2026-07-21` — Created (media-capture Phase 1): moved + generalized `features/audio/audioDevices.ts` into `deviceManager.ts` — camera enumeration, camera permission state + injection seam, generic `MediaDeviceDescriptor`/`MediaPermissionState`; old file deleted, importers flipped, unit tests added.
