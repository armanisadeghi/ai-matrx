"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";

import type { WindowPosition } from "@/features/window-panels/hooks/useWindowPanel";

interface ResourcePickerWindowProps {
  isOpen: boolean;
  onClose: () => void;
  // MATRX-EXCEPTION: pure passthrough of ResourcePickerMenu's own
  // `onResourceSelected(resource: any)` prop (features/resource-manager,
  // out of this scope) — that component calls it with a dozen different
  // ad-hoc `{ type, data }` shapes with no shared union type declared.
  // Fixing this honestly means introducing a `ResourceSelection`
  // discriminated union there first; tracked as a decision brief.
  onResourceSelected: (resource: any) => void;
  attachmentCapabilities?: {
    supportsImageUrls?: boolean;
    supportsFileUrls?: boolean;
    supportsYoutubeVideos?: boolean;
    supportsAudio?: boolean;
  };
  onSettingsClick?: () => void;
  onDebugClick?: () => void;
  showDebugActive?: boolean;
  /** Window width in px (default 340) */
  width?: number;
  /** Window height in px (default 480) */
  height?: number;
  /** Where to open the window (default "center") */
  position?: WindowPosition;
}

export function ResourcePickerWindow({
  isOpen,
  onClose,
  onResourceSelected,
  attachmentCapabilities,
  onSettingsClick,
  onDebugClick,
  showDebugActive,
  width = 340,
  height = 480,
  position = "center",
}: ResourcePickerWindowProps) {
  if (!isOpen) return null;

  return (
    <WindowPanel
      title="Add Resource"
      onClose={onClose}
      width={width}
      height={height}
      position={position}
      minWidth={280}
      minHeight={300}
      overlayId="resourcePickerWindow"
    >
      <ResourcePickerMenu
        onResourceSelected={(resource) => {
          onResourceSelected(resource);
          onClose();
        }}
        onClose={onClose}
        attachmentCapabilities={attachmentCapabilities}
        onSettingsClick={onSettingsClick}
        onDebugClick={onDebugClick}
        showDebugActive={showDebugActive}
      />
    </WindowPanel>
  );
}
