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
import {
  AGENT_PICKER_WINDOW_CONSUMER_ID,
  AgentPickerFrame,
} from "@ai-matrx/chat/window-panels/windows/agents/AgentPickerFrame";
import { emitAgentPickerEvent } from "./agent-picker-callbacks";

export { AGENT_PICKER_WINDOW_CONSUMER_ID, AgentPickerFrame };

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
