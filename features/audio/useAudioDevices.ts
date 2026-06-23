// features/audio/useAudioDevices.ts
//
// React surface for the canonical audio-device manager (`audioDevices.ts`).
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
} from "@/lib/redux/preferences/userPreferenceSelectors";
import {
  type AudioDeviceInfo,
  type AudioDevicesSnapshot,
  type AudioPermissionState,
  applyInputDevice,
  applyOutputDevice,
  ensurePermission,
  getAudioDevicesSnapshot,
  listDevices,
  resolveDeviceId,
  subscribeAudioDevices,
} from "@/features/audio/audioDevices";
import { outputSelectionSupported } from "@/features/audio/audioOutputSink";

const EMPTY_SNAPSHOT: AudioDevicesSnapshot = {
  permissionState: "unknown",
  inputs: [],
  outputs: [],
};

export interface UseAudioDevicesResult {
  permissionState: AudioPermissionState;
  inputs: AudioDeviceInfo[];
  outputs: AudioDeviceInfo[];
  /** Resolved live deviceId for the persisted input choice ("" = default). */
  selectedInputId: string;
  /** Resolved live deviceId for the persisted output choice ("" = default). */
  selectedOutputId: string;
  /** The stored input label (survives id regeneration on iOS). */
  selectedInputLabel: string;
  /** The stored output label. */
  selectedOutputLabel: string;
  /** Choose an input device. "" = system default. Persists + applies live. */
  setInput: (deviceId: string, label: string) => void;
  /** Choose an output device. "" = system default. Persists + applies live. */
  setOutput: (deviceId: string, label: string) => void;
  /** Prompt for mic permission only if needed; refreshes labels on grant. */
  requestPermission: () => Promise<AudioPermissionState>;
  /** Re-enumerate devices now. */
  refresh: () => Promise<void>;
  /** False on Safari (no `setSinkId`) — the speaker picker is disabled there. */
  outputSelectionSupported: boolean;
}

export function useAudioDevices(): UseAudioDevicesResult {
  const dispatch = useAppDispatch();

  const snapshot = useSyncExternalStore(
    subscribeAudioDevices,
    getAudioDevicesSnapshot,
    () => EMPTY_SNAPSHOT, // SSR
  );

  const storedInputId = useAppSelector(selectAudioInputDeviceId);
  const storedInputLabel = useAppSelector(selectAudioInputDeviceLabel);
  const storedOutputId = useAppSelector(selectAudioOutputDeviceId);
  const storedOutputLabel = useAppSelector(selectAudioOutputDeviceLabel);

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

  const setInput = useCallback(
    (deviceId: string, label: string) => {
      dispatch(
        setModulePreferences({
          module: "audioDevices",
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
          module: "audioDevices",
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

  const requestPermission = useCallback(() => ensurePermission(), []);
  const refresh = useCallback(async () => {
    await listDevices();
  }, []);

  return {
    permissionState: snapshot.permissionState,
    inputs: snapshot.inputs,
    outputs: snapshot.outputs,
    selectedInputId,
    selectedOutputId,
    selectedInputLabel: storedInputLabel,
    selectedOutputLabel: storedOutputLabel,
    setInput,
    setOutput,
    requestPermission,
    refresh,
    outputSelectionSupported: outputSelectionSupported(),
  };
}
