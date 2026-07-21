"use client";

// features/settings/tabs/MediaDevicesTab.tsx
//
// The unified "Camera, microphone & speakers" settings tab (registry id
// `devices`, media-capture plan Phase 4). Composed ONLY from official
// settings primitives; device state comes from the shared controller hook
// (`useAudioDevices` — the same non-visual controller the control-window
// MediaDevicesPanel consumes, per the plan's shared-controller decision), and
// the facing-mode preference is written through `useSetting`. Device picks go
// through the controller's setters because a device choice is an (id, label)
// PAIR persisted atomically + applied live — a plain useSetting path can't
// express that. Live testing (mic meter, speaker tone, camera preview) lives
// in the Media control window; this tab links to it rather than duplicating
// that machinery.

import { AppWindow, Camera, Mic, RefreshCw, Speaker } from "lucide-react";
import { SettingsDeviceSelect } from "@/components/official/settings/primitives/SettingsDeviceSelect";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { useAudioDevices } from "@/features/audio/useAudioDevices";
import { useOpenAudioDevices } from "@/features/overlays/openers/audioDevices";
import { useSetting } from "../hooks/useSetting";

export default function MediaDevicesTab() {
  const {
    permissionState,
    cameraPermissionState,
    inputs,
    outputs,
    cameras,
    selectedInputId,
    selectedOutputId,
    selectedCameraId,
    setInput,
    setOutput,
    setCamera,
    requestPermission,
    requestCameraPermission,
    refresh,
    outputSelectionSupported,
  } = useAudioDevices();

  const [facingMode, setFacingMode] = useSetting<"user" | "environment" | "">(
    "userPreferences.mediaDevices.preferredFacingMode",
  );

  const openDevicesWindow = useOpenAudioDevices();

  const micGranted = permissionState === "granted";
  const micDenied = permissionState === "denied";
  const camGranted = cameraPermissionState === "granted";
  const camDenied = cameraPermissionState === "denied";

  return (
    <>
      <SettingsSubHeader
        title="Camera, microphone & speakers"
        description="Your saved devices — remembered across sessions and applied everywhere audio or video is captured or played."
        icon={Camera}
      />

      <SettingsSection title="Microphone" icon={Mic}>
        {micDenied && (
          <SettingsCallout tone="error" title="Microphone access blocked">
            Enable microphone access for this site in your browser settings,
            then refresh the device list.
          </SettingsCallout>
        )}
        <SettingsDeviceSelect
          label="Microphone"
          description={
            micGranted
              ? undefined
              : "Grant access to see your device names."
          }
          devices={inputs}
          selectedId={selectedInputId}
          onSelect={setInput}
          deviceKindLabel="Microphone"
          width="lg"
          last={micGranted || micDenied}
        />
        {!micGranted && !micDenied && (
          <SettingsButton
            label="Microphone access"
            description="Prompts once; the grant is remembered by your browser."
            actionLabel="Grant access"
            onClick={() => void requestPermission()}
            last
          />
        )}
      </SettingsSection>

      <SettingsSection title="Speaker" icon={Speaker}>
        {outputSelectionSupported ? (
          <SettingsDeviceSelect
            label="Speaker"
            devices={outputs}
            selectedId={selectedOutputId}
            onSelect={setOutput}
            deviceKindLabel="Speaker"
            width="lg"
            last
          />
        ) : (
          <SettingsCallout tone="info" title="Speaker selection unavailable">
            This browser can&apos;t switch the audio output device. Choose your
            speaker or headphones in your macOS / iOS sound settings instead.
          </SettingsCallout>
        )}
      </SettingsSection>

      <SettingsSection title="Camera" icon={Camera}>
        {camDenied && (
          <SettingsCallout tone="error" title="Camera access blocked">
            Enable camera access for this site in your browser settings, then
            refresh the device list.
          </SettingsCallout>
        )}
        <SettingsDeviceSelect
          label="Camera"
          description={
            camGranted ? undefined : "Grant access to see your camera names."
          }
          devices={cameras}
          selectedId={selectedCameraId}
          onSelect={setCamera}
          defaultOptionLabel="Automatic"
          deviceKindLabel="Camera"
          width="lg"
        />
        {!camGranted && !camDenied && (
          <SettingsButton
            label="Camera access"
            description="Prompts once; the camera turns off again immediately."
            actionLabel="Grant access"
            onClick={() => void requestCameraPermission()}
          />
        )}
        <SettingsSelect
          label="Preferred direction"
          description="On phones and tablets: front or rear camera by default."
          value={facingMode === "" ? "auto" : facingMode}
          onValueChange={(v) =>
            setFacingMode(v === "auto" ? "" : (v as "user" | "environment"))
          }
          options={[
            { value: "auto", label: "Automatic" },
            { value: "user", label: "Front (facing you)" },
            { value: "environment", label: "Rear (facing away)" },
          ]}
          last
        />
      </SettingsSection>

      <SettingsSection title="Testing & tools">
        <SettingsButton
          label="Refresh device list"
          description="Re-scan after plugging in or removing a device."
          actionLabel="Refresh"
          actionIcon={RefreshCw}
          onClick={() => void refresh()}
        />
        <SettingsButton
          label="Media controls"
          description="Live mic meter, speaker test tone, and camera preview."
          actionLabel="Open"
          actionIcon={AppWindow}
          onClick={() => {
            openDevicesWindow();
          }}
          last
        />
      </SettingsSection>
    </>
  );
}
