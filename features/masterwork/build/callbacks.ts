/**
 * BuildWindow callbacks — the Build window talks back to the Rulebook page
 * that opened it through the global `callbackManager`, the same contract the
 * Add-rule window uses: the opener creates a callback GROUP, passes only its
 * id through `openOverlay` data, and the window emits typed events. Functions
 * cannot travel through Redux.
 */

import { callbackManager } from "@/utils/callbackManager";

export interface BuildBuiltEvent {
  type: "built";
  workflowId: string;
  name: string;
  masterworkKind: string;
}

export interface BuildWindowCloseEvent {
  type: "window-close";
}

export type BuildWindowEvent = BuildBuiltEvent | BuildWindowCloseEvent;

export interface BuildWindowHandlers {
  /** A Masterwork landed — refresh the page's Masterworks list. */
  onBuilt?: (e: BuildBuiltEvent) => void;
  onWindowClose?: (e: BuildWindowCloseEvent) => void;
}

export interface BuildWindowData {
  callbackGroupId?: string | null;
  rulebookId?: string | null;
}

export function createBuildCallbackGroup(handlers: BuildWindowHandlers): {
  callbackGroupId: string;
  dispose: () => void;
} {
  const callbackGroupId = callbackManager.createGroup();
  callbackManager.registerWithContext<BuildWindowEvent>(
    (event) => {
      if (event.type === "built") handlers.onBuilt?.(event);
      else handlers.onWindowClose?.(event);
    },
    { groupId: callbackGroupId },
  );
  return {
    callbackGroupId,
    dispose: () => callbackManager.removeGroup(callbackGroupId),
  };
}

export function emitBuildEvent(
  callbackGroupId: string | undefined | null,
  event: BuildWindowEvent,
): void {
  if (!callbackGroupId) return;
  callbackManager.triggerGroup<BuildWindowEvent>(callbackGroupId, event, {
    removeAfterTrigger: false,
  });
}
