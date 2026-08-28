import { callbackManager } from "@/utils/callbackManager";

export interface GoogleDriveImportedEvent {
  type: "drive-imported";
  files: File[];
  failures: Array<{ name: string; error: string }>;
}

export interface GoogleConnectWindowCloseEvent {
  type: "window-close";
}

export type GoogleConnectWindowEvent =
  GoogleDriveImportedEvent | GoogleConnectWindowCloseEvent;

export interface GoogleConnectWindowHandlers {
  onDriveImported?: (event: GoogleDriveImportedEvent) => void;
  onWindowClose?: (event: GoogleConnectWindowCloseEvent) => void;
}

export function createGoogleConnectCallbackGroup(
  handlers: GoogleConnectWindowHandlers,
): { callbackGroupId: string; dispose: () => void } {
  const callbackGroupId = callbackManager.createGroup();
  callbackManager.registerWithContext<GoogleConnectWindowEvent>(
    (event) => {
      if (event.type === "drive-imported") handlers.onDriveImported?.(event);
      if (event.type === "window-close") handlers.onWindowClose?.(event);
    },
    { groupId: callbackGroupId },
  );
  return {
    callbackGroupId,
    dispose: () => callbackManager.removeGroup(callbackGroupId),
  };
}

export function emitGoogleConnectEvent(
  callbackGroupId: string | null | undefined,
  event: GoogleConnectWindowEvent,
): void {
  if (!callbackGroupId) return;
  callbackManager.triggerGroup(callbackGroupId, event, {
    removeAfterTrigger:
      event.type === "drive-imported" || event.type === "window-close",
  });
}
