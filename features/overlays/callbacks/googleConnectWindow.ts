import { callbackManager } from "@/utils/callbackManager";
import type { CanonicalStorageImport } from "@/features/files/storage-sources/types";

export interface GoogleDriveImportedEvent {
  type: "drive-imported";
  files: CanonicalStorageImport[];
  failures: Array<{ name: string; error: string }>;
}

export interface GoogleConnectWindowCloseEvent {
  type: "window-close";
}

export type GoogleConnectWindowEvent =
  GoogleDriveImportedEvent | GoogleConnectWindowCloseEvent;

export interface GoogleConnectWindowHandlers {
  onDriveImported?: (
    event: GoogleDriveImportedEvent,
  ) => unknown | Promise<unknown>;
  onWindowClose?: (
    event: GoogleConnectWindowCloseEvent,
  ) => unknown | Promise<unknown>;
}

const activeGoogleConnectCallbackGroups = new Set<string>();

export function disposeGoogleConnectCallbackGroup(
  callbackGroupId: string | null | undefined,
): void {
  if (!callbackGroupId) return;
  activeGoogleConnectCallbackGroups.delete(callbackGroupId);
  callbackManager.removeGroup(callbackGroupId);
}

export function createGoogleConnectCallbackGroup(
  handlers: GoogleConnectWindowHandlers,
): { callbackGroupId: string; dispose: () => void } {
  const callbackGroupId = callbackManager.createGroup();
  activeGoogleConnectCallbackGroups.add(callbackGroupId);
  callbackManager.registerWithContext<GoogleConnectWindowEvent>(
    async (event) => {
      if (event.type === "drive-imported") {
        await handlers.onDriveImported?.(event);
      }
      if (event.type === "window-close") {
        await handlers.onWindowClose?.(event);
      }
    },
    { groupId: callbackGroupId },
  );
  return {
    callbackGroupId,
    dispose: () => disposeGoogleConnectCallbackGroup(callbackGroupId),
  };
}

export async function emitGoogleConnectEvent(
  callbackGroupId: string | null | undefined,
  event: GoogleConnectWindowEvent,
): Promise<void> {
  if (
    !callbackGroupId ||
    !activeGoogleConnectCallbackGroups.has(callbackGroupId)
  ) {
    return;
  }
  await callbackManager.triggerGroupCommand(callbackGroupId, event, {
    removeAfterSuccess: false,
  });
}
