"use client";

import React, { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  WindowPanel,
  type WindowPanelProps,
} from "@/features/window-panels/WindowPanel";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";
import AiVoiceFloatingWorkspace from "@/features/audio/voice/AiVoiceFloatingWorkspace";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
// context-menu-exempt: entity — the window is a tabbed voice-tools shell (playground / voices / custom actions), not a single record; a per-voice entity would require wiring inside VoicesList, which this window does not own

export interface AiVoiceWindowProps extends Omit<
  WindowPanelProps,
  "children" | "title"
> {
  title?: string;
  instanceId?: string;
}

export function AiVoiceWindow({
  title = "AI Voice",
  id = "aiVoiceWindow",
  instanceId = "default",
  ...windowProps
}: AiVoiceWindowProps) {
  const dispatch = useAppDispatch();

  const onClose = useCallback(() => {
    // `id` comes from WindowPanelProps where it's typed as a generic string
    // (a React-id fallback). At this seat it always points at a registered
    // overlay, so casting to OverlayId is sound.
    dispatch(closeOverlay({ overlayId: id as OverlayId, instanceId }));
  }, [dispatch, id, instanceId]);

  return (
    <WindowPanel
      id={id}
      title={title}
      onClose={onClose}
      minWidth={360}
      minHeight={400}
      width={480}
      height={600}
      urlSyncKey="aiVoiceWindow"
      urlSyncId={instanceId}
      overlayId="aiVoiceWindow"
      {...windowProps}
    >
      <NonEditableContextMenu
        sourceFeature="voice-agent"
        contentSource={{ type: "raw" }}
        contextData={{ content: "" }}
      >
        <AiVoiceFloatingWorkspace />
      </NonEditableContextMenu>
    </WindowPanel>
  );
}

export default AiVoiceWindow;
