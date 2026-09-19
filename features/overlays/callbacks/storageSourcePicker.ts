import { callbackManager } from "@/utils/callbackManager";
import type { CanonicalStorageImport } from "@/features/files/storage-sources/types";

export interface StorageSourcePickerHandlers {
  onImported: (files: CanonicalStorageImport[]) => unknown | Promise<unknown>;
}

const activeGroups = new Set<string>();

export function createStorageSourcePickerCallbackGroup(
  handlers: StorageSourcePickerHandlers,
): { callbackGroupId: string; dispose: () => void } {
  const callbackGroupId = callbackManager.createGroup();
  activeGroups.add(callbackGroupId);
  callbackManager.registerWithContext<CanonicalStorageImport[]>(
    async (files) => {
      await handlers.onImported(files);
    },
    { groupId: callbackGroupId },
  );
  return {
    callbackGroupId,
    dispose: () => disposeStorageSourcePickerCallbackGroup(callbackGroupId),
  };
}

export async function deliverStorageSourceImports(
  callbackGroupId: string,
  files: CanonicalStorageImport[],
): Promise<void> {
  if (!activeGroups.has(callbackGroupId)) {
    throw new Error("The file destination is no longer available.");
  }
  await callbackManager.triggerGroupCommand(callbackGroupId, files, {
    removeAfterSuccess: false,
  });
}

export function disposeStorageSourcePickerCallbackGroup(
  callbackGroupId: string | null | undefined,
): void {
  if (!callbackGroupId) return;
  activeGroups.delete(callbackGroupId);
  callbackManager.removeGroup(callbackGroupId);
}
