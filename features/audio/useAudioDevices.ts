// features/audio/useAudioDevices.ts
//
// React surface for the canonical media-device manager
// (`features/media-devices/deviceManager.ts`).
// One hook every picker/caret consumes. It:
//   • subscribes to the framework-free manager (permission + live device lists)
//     via `useSyncExternalStore`,
//   • reads the persisted device CHOICE from the userPreferences slice (Redux),
//   • resolves the stored choice → a live `deviceId` (id → label → default),
//   • writes a new choice to BOTH Redux (persisted/synced) AND the manager
//     (which applies it to the mic singleton / output sink immediately).
//
// The manager owns runtime device/permission state; Redux owns the durable
// choice. The hook is the only place that bridges them.

"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setModulePreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import {
  selectAudioInputDeviceId,
  selectAudioInputDeviceLabel,
  selectAudioOutputDeviceId,
  selectAudioOutputDeviceLabel,
  selectVideoInputDeviceId,
  selectVideoInputDeviceLabel,
} from "@/lib/redux/preferences/userPreferenceSelectors";
import {
  type MediaDeviceDescriptor,
  type MediaDevicesSnapshot,
  type MediaPermissionState,
  applyInputDevice,
  applyOutputDevice,
  ensureCameraPermission,
  ensurePermission,
  getMediaDevicesSnapshot,
  listDevices,
  resolveDeviceId,
  subscribeMediaDevices,
} from "@/features/media-devices/deviceManager";
import { outputSelectionSupported } from "@/features/audio/audioOutputSink";

const EMPTY_SNAPSHOT: MediaDevicesSnapshot = {
  permissionState: "unknown",
  cameraPermissionState: "unknown",
  inputs: [],
  outputs: [],
  cameras: [],
};

export interface UseAudioDevicesResult {
  permissionState: MediaPermissionState;
  /** Camera permission state (independent of the mic grant). */
  cameraPermissionState: MediaPermissionState;
  inputs: MediaDeviceDescriptor[];
  outputs: MediaDeviceDescriptor[];
  cameras: MediaDeviceDescriptor[];
  /** Resolved live deviceId for the persisted input choice ("" = default). */
  selectedInputId: string;
  /** Resolved live deviceId for the persisted output choice ("" = default). */
  selectedOutputId: string;
  /** The stored input label (survives id regeneration on iOS). */
  selectedInputLabel: string;
  /** The stored output label. */
  selectedOutputLabel: string;
  /** Resolved live deviceId for the persisted camera choice ("" = auto). */
  selectedCameraId: string;
  /** The stored camera label (survives id regeneration on iOS). */
  selectedCameraLabel: string;
  /** Choose an input device. "" = system default. Persists + applies live. */
  setInput: (deviceId: string, label: string) => void;
  /** Choose an output device. "" = system default. Persists + applies live. */
  setOutput: (deviceId: string, label: string) => void;
  /** Choose a camera. "" = auto. Persists; applied on the NEXT camera acquire
   *  via the preferred-camera resolver (never touches a live lease). */
  setCamera: (deviceId: string, label: string) => void;
  /** Prompt for mic permission only if needed; refreshes labels on grant. */
  requestPermission: () => Promise<MediaPermissionState>;
  /** Prompt for CAMERA permission only if needed (acquire + immediate release
   *  through the camera stream manager); refreshes labels on grant. */
  requestCameraPermission: () => Promise<MediaPermissionState>;
  /** Re-enumerate devices now. */
  refresh: () => Promise<void>;
  /** False on Safari (no `setSinkId`) — the speaker picker is disabled there. */
  outputSelectionSupported: boolean;
}

export function useAudioDevices(): UseAudioDevicesResult {
  const dispatch = useAppDispatch();

  const snapshot = useSyncExternalStore(
    subscribeMediaDevices,
    getMediaDevicesSnapshot,
    () => EMPTY_SNAPSHOT, // SSR
  );

  const storedInputId = useAppSelector(selectAudioInputDeviceId);
  const storedInputLabel = useAppSelector(selectAudioInputDeviceLabel);
  const storedOutputId = useAppSelector(selectAudioOutputDeviceId);
  const storedOutputLabel = useAppSelector(selectAudioOutputDeviceLabel);
  const storedCameraId = useAppSelector(selectVideoInputDeviceId);
  const storedCameraLabel = useAppSelector(selectVideoInputDeviceLabel);

  const selectedInputId = resolveDeviceId(
    snapshot.inputs,
    storedInputId,
    storedInputLabel,
  );
  const selectedOutputId = resolveDeviceId(
    snapshot.outputs,
    storedOutputId,
    storedOutputLabel,
  );
  const selectedCameraId = resolveDeviceId(
    snapshot.cameras,
    storedCameraId,
    storedCameraLabel,
  );

  const setInput = useCallback(
    (deviceId: string, label: string) => {
      dispatch(
        setModulePreferences({
          module: "mediaDevices",
          preferences: {
            audioInputDeviceId: deviceId,
            audioInputDeviceLabel: label,
          },
        }),
      );
      applyInputDevice(deviceId);
    },
    [dispatch],
  );

  const setOutput = useCallback(
    (deviceId: string, label: string) => {
      dispatch(
        setModulePreferences({
          module: "mediaDevices",
          preferences: {
            audioOutputDeviceId: deviceId,
            audioOutputDeviceLabel: label,
          },
        }),
      );
      applyOutputDevice(deviceId);
    },
    [dispatch],
  );

  const setCamera = useCallback(
    (deviceId: string, label: string) => {
      dispatch(
        setModulePreferences({
          module: "mediaDevices",
          preferences: {
            videoInputDeviceId: deviceId,
            videoInputDeviceLabel: label,
          },
        }),
      );
      // No live "apply" here — the camera never runs at boot/idle. The
      // preferred-camera resolver (wired in AudioDeviceProviderImpl) reads the
      // updated preference on the NEXT acquireCameraLease.
    },
    [dispatch],
  );

  const requestPermission = useCallback(() => ensurePermission(), []);
  const requestCameraPermission = useCallback(
    () => ensureCameraPermission(),
    [],
  );
  const refresh = useCallback(async () => {
    await listDevices();
  }, []);

  return {
    permissionState: snapshot.permissionState,
    cameraPermissionState: snapshot.cameraPermissionState,
    inputs: snapshot.inputs,
    outputs: snapshot.outputs,
    cameras: snapshot.cameras,
    selectedInputId,
    selectedOutputId,
    selectedInputLabel: storedInputLabel,
    selectedOutputLabel: storedOutputLabel,
    selectedCameraId,
    selectedCameraLabel: storedCameraLabel,
    setInput,
    setOutput,
    setCamera,
    requestPermission,
    requestCameraPermission,
    refresh,
    outputSelectionSupported: outputSelectionSupported(),
  };
}
