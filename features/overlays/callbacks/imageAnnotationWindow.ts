/**
 * Callback channel for the image-annotation window.
 *
 * Only the serializable group id crosses Redux. Saved file results return to
 * the caller through callbackManager so each surface can own its next step.
 */

import { callbackManager } from "@/utils/callbackManager";
import type { SaveResult } from "@/features/image-studio/modes/shared/types";

export type ImageAnnotationWindowEvent =
  | {
      type: "ready";
      windowInstanceId: string;
    }
  | {
      type: "saved";
      windowInstanceId: string;
      result: SaveResult;
    }
  | {
      type: "window-close";
      windowInstanceId: string;
      lastResult: SaveResult | null;
    };

export interface ImageAnnotationWindowHandlers {
  onReady?: (
    event: Extract<ImageAnnotationWindowEvent, { type: "ready" }>,
  ) => void;
  onSaved?: (
    event: Extract<ImageAnnotationWindowEvent, { type: "saved" }>,
  ) => void | Promise<void>;
  onWindowClose?: (
    event: Extract<ImageAnnotationWindowEvent, { type: "window-close" }>,
  ) => void;
  onEvent?: (event: ImageAnnotationWindowEvent) => void;
}

export interface ImageAnnotationWindowData {
  callbackGroupId?: string | null;
  sourceFileId?: string | null;
  sourceUrl?: string | null;
  sourceFilename?: string | null;
  defaultFolder?: string | null;
  title?: string | null;
  overwriteSource?: boolean;
}

export function createImageAnnotationCallbackGroup(
  handlers: ImageAnnotationWindowHandlers,
): { callbackGroupId: string; dispose: () => void } {
  const callbackGroupId = callbackManager.createGroup();
  callbackManager.registerWithContext<ImageAnnotationWindowEvent>(
    (event) => {
      if (event.type === "ready") handlers.onReady?.(event);
      if (event.type === "saved") void handlers.onSaved?.(event);
      if (event.type === "window-close") handlers.onWindowClose?.(event);
      handlers.onEvent?.(event);
    },
    { groupId: callbackGroupId },
  );
  return {
    callbackGroupId,
    dispose: () => callbackManager.removeGroup(callbackGroupId),
  };
}

export function emitImageAnnotationEvent(
  callbackGroupId: string | null | undefined,
  event: ImageAnnotationWindowEvent,
): void {
  if (!callbackGroupId) return;
  callbackManager.triggerGroup<ImageAnnotationWindowEvent>(
    callbackGroupId,
    event,
    { removeAfterTrigger: false },
  );
}
