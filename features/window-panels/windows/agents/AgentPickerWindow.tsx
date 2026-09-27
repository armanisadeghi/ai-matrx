"use client";

/**
 * AgentPickerWindow — THE agent picker as a floating window.
 *
 * The body is the package's `AgentListPanel`: the exact picker a person sees
 * when they open `AgentListDropdown` — list on the left, hover peek / sort /
 * category / tag panel on the right — at the same fixed 680 × 528 footprint.
 * The window hugs it (`fitContent`), so the picker looks identical in both
 * shells and never resizes while the person hovers or filters.
 *
 * Two ways in:
 *   - `AgentPickerWindow` — the registered overlay `agentPickerWindow`, opened
 *     with `useOpenAgentPickerWindow({ onPicked })`. Picks go back through the
 *     callback group; the window closes after a pick.
 *   - `AgentPickerFrame` — the same frame for a registered window that needs a
 *     step AFTER the pick (send-to-agent chooses where content goes). Pass
 *     `children` to replace the panel with that step at the same footprint.
 */

import { useRef } from "react";
import {
  AgentListPanel,
  PANEL_WIDTH,
  PANEL_HEIGHT,
} from "@ai-matrx/agents/catalog/react";
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
   * A step shown INSTEAD of the picker, at the same footprint (for flows that
   * continue after the pick). Omit to show the picker.
   */
  children?: React.ReactNode;
}

export function AgentPickerFrame({
  id,
  overlayId,
  title,
  onClose,
  onSelect,
  activeAgentId,
  consumerId = AGENT_PICKER_WINDOW_CONSUMER_ID,
  children,
}: AgentPickerFrameProps) {
  return (
    <WindowPanel
      id={id}
      overlayId={overlayId}
      title={title}
      onClose={onClose}
      position="center"
      fitContent
      bodyClassName="p-0"
    >
      {children ? (
        <div
          className="flex min-h-0 flex-col overflow-hidden max-md:h-full max-md:w-full"
          style={{ width: PANEL_WIDTH, height: PANEL_HEIGHT, maxWidth: "100%" }}
        >
          {children}
        </div>
      ) : (
        <AgentListPanel
          consumerId={consumerId}
          onSelect={onSelect}
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
      title={title?.trim() || "Choose an agent"}
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
