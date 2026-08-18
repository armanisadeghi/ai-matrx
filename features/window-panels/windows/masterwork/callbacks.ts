/**
 * AddRuleWindow callbacks — the window talks back to the Rulebook page that
 * opened it via the global `callbackManager`, same contract as the
 * create-project window: the opener creates a callback GROUP, passes its id
 * through `openOverlay` data, and the window emits typed events.
 */

import { callbackManager } from "@/utils/callbackManager";
import type { Rulebook, RulebookRule } from "@/features/masterwork/types";

export type AddRuleWindowEventType = "added" | "window-close";

export interface AddRuleAddedEvent {
  type: "added";
  rule: RulebookRule;
  rulebook: Rulebook;
}

export interface AddRuleWindowCloseEvent {
  type: "window-close";
}

export type AddRuleWindowEvent = AddRuleAddedEvent | AddRuleWindowCloseEvent;

export interface AddRuleWindowHandlers {
  /** A rule landed (either lane) — refresh the page's Rulebook state. */
  onAdded?: (e: AddRuleAddedEvent) => void;
  onWindowClose?: (e: AddRuleWindowCloseEvent) => void;
}

export interface AddRuleWindowData {
  callbackGroupId?: string | null;
  rulebookId?: string | null;
  defaultSection?: string | null;
}

export function createAddRuleCallbackGroup(handlers: AddRuleWindowHandlers): {
  callbackGroupId: string;
  dispose: () => void;
} {
  const callbackGroupId = callbackManager.createGroup();
  callbackManager.registerWithContext<AddRuleWindowEvent>(
    (event) => {
      if (event.type === "added") handlers.onAdded?.(event);
      else handlers.onWindowClose?.(event);
    },
    { groupId: callbackGroupId },
  );
  return {
    callbackGroupId,
    dispose: () => callbackManager.removeGroup(callbackGroupId),
  };
}

export function emitAddRuleEvent(
  callbackGroupId: string | undefined | null,
  event: AddRuleWindowEvent,
): void {
  if (!callbackGroupId) return;
  callbackManager.triggerGroup<AddRuleWindowEvent>(callbackGroupId, event, {
    removeAfterTrigger: false,
  });
}
