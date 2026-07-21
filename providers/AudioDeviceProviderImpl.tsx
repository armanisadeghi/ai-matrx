"use client";

// providers/AudioDeviceProviderImpl.tsx
//
// The effectful body of AudioDeviceProvider (loaded via next/dynamic, ssr:false).
// Renders nothing — it only:
//   1. wires the manager's `devicechange` / Permissions API listeners once,
//   2. applies the user's persisted mic + speaker choice to the mic singleton /
//      output sink EARLY — and re-applies whenever the persisted choice changes
//      (cross-tab edit, rehydrate) or the live device list changes (so a stored
//      label re-resolves to a fresh deviceId on iOS, where ids regenerate),
//   3. installs the LAZY preferred-camera resolver + the camera-permission
//      acquirer on the camera stream manager. NO boot-time camera acquisition —
//      the resolver is only consulted when a surface calls acquireCameraLease,
//      and the acquirer only runs when ensureCameraPermission is invoked.
//
// Web Audio speaker routing is owned by SinkAwarePlayer
// (features/audio/sinkAwarePlayer.ts), which reads the output-sink store this
// provider feeds — the old global AudioContext monkeypatch is gone.

import { useEffect, useSyncExternalStore } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAudioInputDeviceId,
  selectAudioInputDeviceLabel,
  selectAudioOutputDeviceId,
  selectAudioOutputDeviceLabel,
  selectPreferredFacingMode,
  selectVideoInputDeviceId,
  selectVideoInputDeviceLabel,
} from "@/lib/redux/preferences/userPreferenceSelectors";
import {
  applyInputDevice,
  applyOutputDevice,
  getMediaDevicesSnapshot,
  resolveDeviceId,
  startDeviceListeners,
  subscribeMediaDevices,
  type MediaDevicesSnapshot,
} from "@/features/media-devices/deviceManager";
import {
  installCameraPermissionAcquirer,
  setPreferredCameraResolver,
  type PreferredCameraSelection,
} from "@/features/media-capture/runtime/camera-stream-manager";

const EMPTY_SNAPSHOT: MediaDevicesSnapshot = {
  permissionState: "unknown",
  cameraPermissionState: "unknown",
  inputs: [],
  outputs: [],
  cameras: [],
};

export default function AudioDeviceProviderImpl(): null {
  const inputId = useAppSelector(selectAudioInputDeviceId);
  const inputLabel = useAppSelector(selectAudioInputDeviceLabel);
  const outputId = useAppSelector(selectAudioOutputDeviceId);
  const outputLabel = useAppSelector(selectAudioOutputDeviceLabel);
  const cameraId = useAppSelector(selectVideoInputDeviceId);
  const cameraLabel = useAppSelector(selectVideoInputDeviceLabel);
  const facingMode = useAppSelector(selectPreferredFacingMode);

  const snapshot = useSyncExternalStore(
    subscribeMediaDevices,
    getMediaDevicesSnapshot,
    () => EMPTY_SNAPSHOT,
  );

  // One-time boot wiring. `installCameraPermissionAcquirer` only REGISTERS the
  // acquirer with the device manager — nothing touches the camera until a
  // surface explicitly calls ensureCameraPermission / acquireCameraLease.
  useEffect(() => {
    console.log("[AudioDeviceProviderImpl] Starting device listeners");
    startDeviceListeners();
    installCameraPermissionAcquirer();
  }, []);

  // Apply the persisted INPUT choice to the mic singleton. Prefer a live
  // resolution (id → label → default) once devices are enumerated; before that
  // (no labels yet) fall back to the raw stored id — the singleton applies it
  // as an `{ideal}` constraint, so a stale id degrades to the default with no
  // error. Re-runs when the choice or the device list changes.
  useEffect(() => {
    const resolved =
      snapshot.inputs.length > 0
        ? resolveDeviceId(snapshot.inputs, inputId, inputLabel)
        : inputId;
    applyInputDevice(resolved);
  }, [inputId, inputLabel, snapshot.inputs]);

  // Apply the persisted OUTPUT choice to the output-sink store. Same
  // resolve-then-fallback strategy.
  useEffect(() => {
    const resolved =
      snapshot.outputs.length > 0
        ? resolveDeviceId(snapshot.outputs, outputId, outputLabel)
        : outputId;
    applyOutputDevice(resolved);
  }, [outputId, outputLabel, snapshot.outputs]);

  // Install the LAZY preferred-camera resolver: consulted by the camera stream
  // manager only at acquire time (for spec fields the caller leaves undefined).
  // Mirrors the audio-input application above — resolve the stored id+label
  // against the live camera list (id → label → auto) — but never acquires the
  // camera itself. Reinstalled when the choice or camera list changes so the
  // closure always reads current values; cleared on unmount.
  useEffect(() => {
    setPreferredCameraResolver((): PreferredCameraSelection => {
      const resolved =
        snapshot.cameras.length > 0
          ? resolveDeviceId(snapshot.cameras, cameraId, cameraLabel)
          : cameraId;
      return {
        deviceId: resolved || null,
        facingMode: facingMode || null,
      };
    });
    return () => {
      setPreferredCameraResolver(null);
    };
  }, [cameraId, cameraLabel, facingMode, snapshot.cameras]);

  return null;
}
