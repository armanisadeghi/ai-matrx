/**
 * Callback group for the `saveToTable` overlay — the caller learns which table the rows landed in
 * (the canvas table artifact links itself to it, so it becomes a live table in the conversation).
 * Functions never travel through Redux; the group id does.
 */
import { callbackManager } from "@/utils/callbackManager";

export interface SaveToTableSavedEvent {
  type: "saved";
  tableId: string;
  /** `new` when the overlay made the table; `existing` when rows were added to one. */
  how: "new" | "existing";
  /** The table's name, when the overlay knows it. */
  tableName: string | null;
}

export interface SaveToTableHandlers {
  onSaved?: (event: SaveToTableSavedEvent) => unknown | Promise<unknown>;
}

const activeGroups = new Set<string>();

export function disposeSaveToTableCallbackGroup(callbackGroupId: string | null | undefined): void {
  if (!callbackGroupId) return;
  activeGroups.delete(callbackGroupId);
  callbackManager.removeGroup(callbackGroupId);
}

export function createSaveToTableCallbackGroup(handlers: SaveToTableHandlers): {
  callbackGroupId: string;
  dispose: () => void;
} {
  const callbackGroupId = callbackManager.createGroup();
  activeGroups.add(callbackGroupId);
  callbackManager.registerWithContext<SaveToTableSavedEvent>(
    async (event) => {
      if (event.type === "saved") await handlers.onSaved?.(event);
    },
    { groupId: callbackGroupId },
  );
  return { callbackGroupId, dispose: () => disposeSaveToTableCallbackGroup(callbackGroupId) };
}

export async function emitSaveToTableEvent(
  callbackGroupId: string | null | undefined,
  event: SaveToTableSavedEvent,
): Promise<void> {
  if (!callbackGroupId || !activeGroups.has(callbackGroupId)) return;
  await callbackManager.triggerGroupCommand(callbackGroupId, event, { removeAfterSuccess: false });
}
