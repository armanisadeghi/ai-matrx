/**
 * SurfaceAgentBindWindow callbacks.
 *
 * The window talks back to the page that opened it via `callbackManager`:
 *   1. Caller creates a group via `createSurfaceAgentBindCallbackGroup`
 *   2. Passes `callbackGroupId` through `openOverlay` data
 *   3. Window emits `bound` / `window-close` events
 *   4. Caller `dispose()`s when done
 */

import { callbackManager } from "@/utils/callbackManager";

export type SurfaceAgentBindEventType = "bound" | "window-close";

export interface SurfaceAgentBindEventBase {
  type: SurfaceAgentBindEventType;
  instanceId: string;
}

export interface SurfaceAgentBindBoundEvent extends SurfaceAgentBindEventBase {
  type: "bound";
  bindingId: string;
  agentId: string;
  surfaceName: string;
}

export interface SurfaceAgentBindCloseEvent extends SurfaceAgentBindEventBase {
  type: "window-close";
}

export type SurfaceAgentBindEvent =
  SurfaceAgentBindBoundEvent | SurfaceAgentBindCloseEvent;

export interface SurfaceAgentBindHandlers {
  onBound?: (e: SurfaceAgentBindBoundEvent) => void;
  onWindowClose?: (e: SurfaceAgentBindCloseEvent) => void;
  onEvent?: (e: SurfaceAgentBindEvent) => void;
}

export interface SurfaceAgentBindWindowData {
  surfaceName: string;
  surfaceLabel?: string | null;
  initialAgentId?: string | null;
  callbackGroupId?: string | null;
}

export function createSurfaceAgentBindCallbackGroup(
  handlers: SurfaceAgentBindHandlers,
): { callbackGroupId: string; dispose: () => void } {
  const callbackGroupId = callbackManager.createGroup();

  const fanOut = (event: SurfaceAgentBindEvent) => {
    switch (event.type) {
      case "bound":
        handlers.onBound?.(event);
        break;
      case "window-close":
        handlers.onWindowClose?.(event);
        break;
    }
    handlers.onEvent?.(event);
  };

  callbackManager.registerWithContext<SurfaceAgentBindEvent>(
    (event) => fanOut(event),
    { groupId: callbackGroupId },
  );

  return {
    callbackGroupId,
    dispose: () => callbackManager.removeGroup(callbackGroupId),
  };
}

export function emitSurfaceAgentBindEvent(
  callbackGroupId: string | undefined | null,
  event: SurfaceAgentBindEvent,
): void {
  if (!callbackGroupId) return;
  callbackManager.triggerGroup<SurfaceAgentBindEvent>(callbackGroupId, event, {
    removeAfterTrigger: false,
  });
}
