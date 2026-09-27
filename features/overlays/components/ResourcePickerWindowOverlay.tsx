"use client";

/**
 * Renders `ResourcePickerWindow` for the `resourcePickerWindow` overlay with
 * the host's own handlers, read from the callback group the opener made.
 * With no group (a stale or foreign open) there is nothing to attach to, so it
 * says so and closes rather than showing a picker whose picks go nowhere.
 */

import { useEffect, useState } from "react";
import { ResourcePickerWindow } from "@/features/window-panels/windows/ResourcePickerWindow";
import {
  disposeResourcePickerWindowCallbackGroup,
  getResourcePickerWindowCallbackGroup,
} from "@/features/overlays/callbacks/resourcePickerWindow";
import type { ResourcePickerViewId } from "@/features/resource-manager/resource-picker/resource-picker-menu-items";
import { toast } from "@/lib/toast";

interface ResourcePickerWindowOverlayProps {
  onClose: () => void;
  callbackGroupId: string | null;
  initialView: ResourcePickerViewId;
}

export default function ResourcePickerWindowOverlay({
  onClose,
  callbackGroupId,
  initialView,
}: ResourcePickerWindowOverlayProps) {
  const [group] = useState(() => getResourcePickerWindowCallbackGroup(callbackGroupId));
  useEffect(() => {
    if (!group) {
      toast.error("That picker lost the chat it belonged to — open it again from the chat.");
      onClose();
    }
    return () => disposeResourcePickerWindowCallbackGroup(callbackGroupId);
  }, [group, callbackGroupId, onClose]);
  if (!group) return null;
  return (
    <ResourcePickerWindow
      isOpen
      onClose={onClose}
      onResourceSelected={group.onResourceSelected}
      onResourceDeselected={group.onResourceDeselected}
      attachmentCapabilities={group.attachmentCapabilities}
      conversationId={group.conversationId}
      allowedViewIds={group.allowedViewIds}
      selectionMode={group.selectionMode}
      initialView={initialView}
    />
  );
}
