"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { MediaDevicesPanel } from "@/features/audio/components/devices/MediaDevicesPanel";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

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
      {/* 🚨 A WINDOW MOUNTS ITS OWN MENU (context-menu-v3 SKILL). Without
          this, a right-click here is answered by whatever page sits
          underneath. Page-local — a live device picker + meters, no
          record of its own to attach/share. */}
      <NonEditableContextMenu sourceFeature="system" contentSource={{ type: "raw" }}>
        <MediaDevicesPanel />
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
