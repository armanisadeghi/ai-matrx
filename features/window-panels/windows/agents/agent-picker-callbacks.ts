/**
 * AgentPickerWindow callbacks — the live channel back to whoever opened the
 * picker. Same contract as `CuratedIconPickerWindow` / `ImageUploaderWindow`:
 * the opener creates a callback GROUP, only its id travels through
 * `openOverlay` data, and the window emits typed events into it.
 */

import { callbackManager } from "@/utils/callbackManager";

export type AgentPickerEventType = "picked" | "window-close";

export interface AgentPickerPickedEvent {
  type: "picked";
  instanceId: string;
  /** The chosen agent's id (`mandate:<key>` for a mandate default row). */
  agentId: string;
}

export interface AgentPickerCloseEvent {
  type: "window-close";
  instanceId: string;
  /** The agent picked in this session, if any. */
  pickedAgentId: string | null;
}

export type AgentPickerEvent = AgentPickerPickedEvent | AgentPickerCloseEvent;

export interface AgentPickerHandlers {
  /** The person chose an agent. The window closes right after. */
  onPicked?: (e: AgentPickerPickedEvent) => void;
  /** The window closed — with or without a pick. */
  onWindowClose?: (e: AgentPickerCloseEvent) => void;
}

export interface AgentPickerWindowData {
  callbackGroupId?: string | null;
  title?: string | null;
  activeAgentId?: string | null;
}

export function createAgentPickerCallbackGroup(handlers: AgentPickerHandlers): {
  callbackGroupId: string;
  dispose: () => void;
} {
  const callbackGroupId = callbackManager.createGroup();
  callbackManager.registerWithContext<AgentPickerEvent>(
    (event) => {
      if (event.type === "picked") handlers.onPicked?.(event);
      else handlers.onWindowClose?.(event);
    },
    { groupId: callbackGroupId },
  );
  return {
    callbackGroupId,
    dispose: () => callbackManager.removeGroup(callbackGroupId),
  };
}

export function emitAgentPickerEvent(
  callbackGroupId: string | null | undefined,
  event: AgentPickerEvent,
): void {
  if (!callbackGroupId) return;
  callbackManager.triggerGroup<AgentPickerEvent>(callbackGroupId, event, {
    removeAfterTrigger: false,
  });
}
