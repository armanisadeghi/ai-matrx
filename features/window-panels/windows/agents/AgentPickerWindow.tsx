"use client";

/**
 * AgentPickerWindow — THE agent picker as a floating window.
 *
 * The body is the package's `AgentListPanel`: the exact picker a person sees
 * when they open `AgentListDropdown` — list on the left, hover peek / sort /
 * category / tag panel on the right — at the same fixed 680 × 528 footprint.
 * The window opens at that size and is an ordinary resizable WindowPanel;
 * the panel fills it (list column grows, peek stays 340px).
 *
 * Two ways in:
 *   - `AgentPickerWindow` — the registered overlay `agentPickerWindow`, opened
 *     with `useOpenAgentPickerWindow({ onPicked })`. Picks go back through the
 *     callback group; the window closes after a pick.
 *   - `AgentPickerFrame` — the same frame for a registered window that needs a
 *     step AFTER the pick (send-to-agent chooses where content goes). Pass
 *     `children` (and the window's own footer slots) to replace the panel.
 */

import { useRef } from "react";
import { AgentListPanel } from "@ai-matrx/agents/catalog/react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { emitAgentPickerEvent } from "./agent-picker-callbacks";

export const AGENT_PICKER_WINDOW_CONSUMER_ID = "agent-picker-window";

type AgentPickerFrameOverlayId = "agentPickerWindow" | "sendToAgentWindow";

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
  /**
   * A step shown INSTEAD of the picker, in the same window (for flows that
   * continue after the pick). Omit to show the picker.
   */
  children?: React.ReactNode;
  /** The window's own footer slots — for a step's actions. */
  footerLeft?: React.ReactNode;
  footerRight?: React.ReactNode;
}

/**
 * Opening size: the dropdown's 680 × 528 picker plus the window chrome
 * (33px header, the body's 6px gutter on each side, the 1px frame). The
 * window is an ordinary resizable WindowPanel from there.
 */
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

export interface AgentPickerWindowProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  /** From overlay data — connects the pick back to the opener. */
  callbackGroupId?: string | null;
  title?: string | null;
  activeAgentId?: string | null;
}

export default function AgentPickerWindow({
  isOpen,
  onClose,
  instanceId,
  callbackGroupId,
  title,
  activeAgentId,
}: AgentPickerWindowProps) {
  const pickedRef = useRef<string | null>(null);
  if (!isOpen) return null;

  const handleClose = () => {
    emitAgentPickerEvent(callbackGroupId, {
      type: "window-close",
      instanceId,
      pickedAgentId: pickedRef.current,
    });
    onClose();
  };

  return (
    <AgentPickerFrame
      id={`agent-picker-${instanceId}`}
      overlayId="agentPickerWindow"
      title={title?.trim() || "Select Agent"}
      onClose={handleClose}
      activeAgentId={activeAgentId ?? null}
      onSelect={(agentId) => {
        pickedRef.current = agentId;
        emitAgentPickerEvent(callbackGroupId, {
          type: "picked",
          instanceId,
          agentId,
        });
        handleClose();
      }}
    />
  );
}
