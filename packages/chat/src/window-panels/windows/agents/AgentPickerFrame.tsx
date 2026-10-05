"use client";

/**
 * AgentPickerFrame — THE agent picker in a window frame (moved from the app, P18).
 *
 * The body is `AgentListPanel`, at the dropdown's fixed 680 x 528 footprint. The window
 * is whatever the host registered as `WindowPanel` (a bare host: the package default).
 * Pass `children` (and the window's own footer slots) to show a step INSTEAD of the picker.
 */

import type { ReactNode } from "react";
import { AgentListPanel } from "@ai-matrx/agents/catalog/react";
import { WindowPanel } from "../../../host/ui-slots";
import { CHAT_WINDOWS } from "../../../host/windows";

export const AGENT_PICKER_WINDOW_CONSUMER_ID = "agent-picker-window";

/** The windows this frame frames: the host's picker window plus two package windows. */
type AgentPickerFrameOverlayId =
  | "agentPickerWindow"
  | typeof CHAT_WINDOWS.sendToAgentWindow
  | typeof CHAT_WINDOWS.customAgentWindow;

export interface AgentPickerFrameProps {
  /** Window-manager id — unique per open window. */
  id: string;
  overlayId: AgentPickerFrameOverlayId;
  title: string;
  onClose: () => void;
  /** The chosen agent's id. */
  onSelect: (agentId: string) => void;
  /** Highlights + previews this agent when the picker opens. */
  activeAgentId?: string | null;
  /** Filter/tab state slot. Defaults to the shared picker-window slot. */
  consumerId?: string;
  children?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
}

/** The dropdown's 680 x 528 picker plus the window chrome. */
const OPEN_WIDTH = 694;
const OPEN_HEIGHT = 573;

export function AgentPickerFrame({
  id,
  overlayId,
  title,
  onClose,
  onSelect,
  activeAgentId,
  consumerId = AGENT_PICKER_WINDOW_CONSUMER_ID,
  children,
  footerLeft,
  footerRight,
}: AgentPickerFrameProps) {
  return (
    <WindowPanel
      id={id}
      overlayId={overlayId}
      title={title}
      onClose={onClose}
      position="center"
      width={OPEN_WIDTH}
      height={OPEN_HEIGHT}
      bodyClassName="p-0"
      {...(footerLeft ? { footerLeft } : {})}
      {...(footerRight ? { footerRight } : {})}
    >
      {children ?? (
        <AgentListPanel
          consumerId={consumerId}
          onSelect={onSelect}
          fill
          {...(activeAgentId !== undefined ? { activeAgentId } : {})}
          showPinnedAgent={Boolean(activeAgentId)}
        />
      )}
    </WindowPanel>
  );
}
