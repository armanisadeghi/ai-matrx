"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AudioDevicesPanel } from "@/features/audio/components/devices/AudioDevicesPanel";

interface AudioDevicesWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Thin shell: WindowPanel provides the floating-window chrome on desktop and the
 * mobile Drawer (via the registry's `mobilePresentation: "drawer"`), while the
 * audio-device logic stays in the audio feature.
 */
export default function AudioDevicesWindow({
  isOpen,
  onClose,
}: AudioDevicesWindowProps) {
  if (!isOpen) return null;

  return (
    <WindowPanel
      title="Audio devices"
      id="audio-devices-default"
      minWidth={340}
      minHeight={360}
      width={440}
      height={520}
      onClose={onClose}
      overlayId="audioDevices"
    >
      <AudioDevicesPanel />
    </WindowPanel>
  );
}
