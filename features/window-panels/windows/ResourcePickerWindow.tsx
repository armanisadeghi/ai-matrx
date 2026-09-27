"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

import type { WindowPosition } from "@/features/window-panels/hooks/useWindowPanel";
import type { Resource } from "@/features/agents/resources/types";
import type { ResourcePickerViewId } from "@/features/resource-manager/resource-picker/resource-picker-menu-items";

interface ResourcePickerWindowProps {
  isOpen: boolean;
  onClose: () => void;
  onResourceSelected: (
    resource: Resource,
  ) => boolean | void | Promise<boolean | void>;
  onResourceDeselected?: (
    resource: Resource,
  ) => boolean | void | Promise<boolean | void>;
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
  /** The composer this picker attaches to (Voice, Tools and Skills need it). */
  conversationId?: string;
  allowedViewIds?: readonly Exclude<ResourcePickerViewId, null>[];
  selectionMode?: "single" | "multiple";
  /** Open straight into one view (a ⌘K picker command). */
  initialView?: ResourcePickerViewId;
}

export function ResourcePickerWindow({
  isOpen,
  onClose,
  onResourceSelected,
  onResourceDeselected,
  attachmentCapabilities,
  onSettingsClick,
  onDebugClick,
  showDebugActive,
  width = 340,
  height = 480,
  position = "center",
  conversationId,
  allowedViewIds,
  selectionMode,
  initialView,
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
      {/* 🚨 A WINDOW MOUNTS ITS OWN MENU (context-menu-v3 SKILL). Without
          this, a right-click here is answered by whatever page sits
          underneath. Page-local — this is a category-navigation picker
          (Notes/Tasks/Files/Tables/…), not a single content record. */}
      <NonEditableContextMenu sourceFeature="system" contentSource={{ type: "raw" }}>
        <ResourcePickerMenu
          onResourceSelected={onResourceSelected}
          onResourceDeselected={onResourceDeselected}
          onClose={onClose}
          conversationId={conversationId}
          allowedViewIds={allowedViewIds}
          selectionMode={selectionMode}
          initialView={initialView}
          attachmentCapabilities={attachmentCapabilities}
          onSettingsClick={onSettingsClick}
          onDebugClick={onDebugClick}
          showDebugActive={showDebugActive}
        />
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
