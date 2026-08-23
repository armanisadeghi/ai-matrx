import { callbackManager } from "@/utils/callbackManager";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

export interface DirectiveReferencePickedEvent {
  type: "picked";
  instanceId: string;
  entityToken: EntityTypeToken;
  fieldKey: string;
  id: string;
  title: string;
}

export interface DirectiveReferencePickerClosedEvent {
  type: "window-close";
  instanceId: string;
}

export type DirectiveReferencePickerEvent =
  DirectiveReferencePickedEvent | DirectiveReferencePickerClosedEvent;

export interface DirectiveReferencePickerHandlers {
  onPicked?: (event: DirectiveReferencePickedEvent) => void;
  onWindowClose?: (event: DirectiveReferencePickerClosedEvent) => void;
}

export interface DirectiveReferencePickerWindowData {
  callbackGroupId: string;
  entityToken: EntityTypeToken;
  fieldKey: string;
  title: string;
}

export function createDirectiveReferencePickerCallbackGroup(
  handlers: DirectiveReferencePickerHandlers,
): { callbackGroupId: string; dispose: () => void } {
  const callbackGroupId = callbackManager.createGroup();
  callbackManager.registerWithContext<DirectiveReferencePickerEvent>(
    (event) => {
      if (event.type === "picked") handlers.onPicked?.(event);
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

export function emitDirectiveReferencePickerEvent(
  callbackGroupId: string | null | undefined,
  event: DirectiveReferencePickerEvent,
): void {
  if (!callbackGroupId) return;
  callbackManager.triggerGroup<DirectiveReferencePickerEvent>(
    callbackGroupId,
    event,
    {
      removeAfterTrigger: false,
    },
  );
}
