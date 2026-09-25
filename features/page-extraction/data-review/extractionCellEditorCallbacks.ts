/**
 * Callback bridge for ExtractionCellEditorWindow — the window saves via API
 * and notifies the opener so the dataset grid can patch local state.
 */

import { callbackManager } from "@/utils/callbackManager";

interface ExtractionCellEditorTargetBase {
  rowId: string;
  columnKey: string;
  columnLabel: string;
  pageLabel: string;
  value: string;
}

/** Read-only cells reuse the existing window without ever receiving write data. */
export interface ExtractionCellViewerTarget extends ExtractionCellEditorTargetBase {
  readOnly: true;
}

export interface ExtractionCellEditorTarget extends ExtractionCellEditorTargetBase {
  readOnly?: false;
  writeKey: string;
  currentPayload: Record<string, unknown>;
}

export type ExtractionCellEditorTargetInput =
  | ExtractionCellViewerTarget
  | ExtractionCellEditorTarget;

export interface ExtractionCellEditorSavedEvent {
  type: "saved";
  instanceId: string;
  target: ExtractionCellEditorTarget;
  value: string;
}

export interface ExtractionCellEditorCloseEvent {
  type: "window-close";
  instanceId: string;
}

export type ExtractionCellEditorEvent =
  ExtractionCellEditorSavedEvent | ExtractionCellEditorCloseEvent;

export interface ExtractionCellEditorHandlers {
  onSaved?: (e: ExtractionCellEditorSavedEvent) => void;
  onWindowClose?: (e: ExtractionCellEditorCloseEvent) => void;
}

export type ExtractionCellEditorWindowData = ExtractionCellEditorTargetInput & {
  callbackGroupId?: string | null;
};

export function createExtractionCellEditorCallbackGroup(
  handlers: ExtractionCellEditorHandlers,
): { callbackGroupId: string; dispose: () => void } {
  const callbackGroupId = callbackManager.createGroup();

  callbackManager.registerWithContext<ExtractionCellEditorEvent>(
    (event) => {
      if (event.type === "saved") handlers.onSaved?.(event);
      else handlers.onWindowClose?.(event);
    },
    { groupId: callbackGroupId },
  );

  return {
    callbackGroupId,
    dispose: () => callbackManager.removeGroup(callbackGroupId),
  };
}

export function emitExtractionCellEditorEvent(
  callbackGroupId: string | undefined | null,
  event: ExtractionCellEditorEvent,
): void {
  if (!callbackGroupId) return;
  callbackManager.triggerGroup<ExtractionCellEditorEvent>(
    callbackGroupId,
    event,
    {
      removeAfterTrigger: false,
    },
  );
}

export function extractionCellEditorInstanceId(
  rowId: string,
  columnKey: string,
): string {
  return `extraction-cell-${rowId}-${columnKey}`;
}
