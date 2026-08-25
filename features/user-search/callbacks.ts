import { callbackManager } from "@/utils/callbackManager";
import type { UserSearchCandidate } from "./types";

export interface UserSearchSelectedEvent {
  type: "selected";
  instanceId: string;
  user: UserSearchCandidate;
}

export interface UserSearchClosedEvent {
  type: "window-close";
  instanceId: string;
}

export type UserSearchEvent = UserSearchSelectedEvent | UserSearchClosedEvent;

export interface UserSearchHandlers {
  onSelected?: (event: UserSearchSelectedEvent) => void;
  onWindowClose?: (event: UserSearchClosedEvent) => void;
}

export function createUserSearchCallbackGroup(handlers: UserSearchHandlers): {
  callbackGroupId: string;
  dispose: () => void;
} {
  const callbackGroupId = callbackManager.createGroup();
  callbackManager.registerWithContext<UserSearchEvent>(
    (event) => {
      if (event.type === "selected") handlers.onSelected?.(event);
      else {
        handlers.onWindowClose?.(event);
        callbackManager.removeGroup(callbackGroupId);
      }
    },
    { groupId: callbackGroupId },
  );
  return {
    callbackGroupId,
    dispose: () => callbackManager.removeGroup(callbackGroupId),
  };
}

export function emitUserSearchEvent(
  callbackGroupId: string | null | undefined,
  event: UserSearchEvent,
): void {
  if (!callbackGroupId) return;
  callbackManager.triggerGroup<UserSearchEvent>(callbackGroupId, event, {
    removeAfterTrigger: false,
  });
}
