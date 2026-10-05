// features/agents/utils/launch-widget-handles.ts
//
// LAUNCH-SCOPED WIDGET HANDLES — one per run launched from an editable
// surface's menu: every widget_* method forwards (at call time) to the
// surface's own handle, plus that launch's `selection` write-back (Replace /
// Insert below on the answer — context-menu-v3/utils/selection-write-back.ts).
//
// Lifetime: the surface handle is owned by its hook (unregistered on unmount);
// a launch handle is owned HERE and released when the run's result card closes
// or its conversation ends (launch-handle-release.middleware.ts). Only ids
// registered here are ever released by that middleware — a surface handle id
// is never touched.

import {
  WIDGET_TOOL_NAME_TO_HANDLE_METHOD,
  type SelectionWriteBack,
  type WidgetHandle,
} from "../types/widget-handle.types";
import { callbackManager } from "@ai-matrx/chat/utils/callbackManager";

const launchHandleIds = new Set<string>();

/**
 * Register a launch-scoped handle. Returns the id to pass as
 * `runtime.widgetHandleId`, or the surface id unchanged when there is no
 * write-back to add.
 */
export function registerLaunchWidgetHandle(
  surfaceHandleId: string | null | undefined,
  selection: SelectionWriteBack | null,
): string | undefined {
  if (!selection) return surfaceHandleId ?? undefined;
  const handle: WidgetHandle = { selection };
  const keys = [
    ...Object.values(WIDGET_TOOL_NAME_TO_HANDLE_METHOD),
    "onComplete",
    "onCancel",
    "onError",
    "readText",
  ] as const;
  for (const key of keys) {
    Object.defineProperty(handle, key, {
      enumerable: true,
      configurable: true,
      get() {
        const surface = surfaceHandleId
          ? callbackManager.get<WidgetHandle>(surfaceHandleId)
          : undefined;
        const method = surface?.[key];
        return typeof method === "function"
          ? (method as (...a: unknown[]) => unknown).bind(surface)
          : undefined;
      },
    });
  }
  // The surface's write policy travels with its methods (absent = ask).
  Object.defineProperty(handle, "applyPolicy", {
    enumerable: true,
    configurable: true,
    get() {
      return surfaceHandleId
        ? callbackManager.get<WidgetHandle>(surfaceHandleId)?.applyPolicy
        : undefined;
    },
  });
  const id = callbackManager.registerWidgetHandle(handle);
  launchHandleIds.add(id);
  return id;
}

/** Release a launch-scoped handle. A no-op for any other id (surface handles). */
export function releaseLaunchWidgetHandle(id: string | null | undefined): boolean {
  if (!id || !launchHandleIds.has(id)) return false;
  launchHandleIds.delete(id);
  callbackManager.unregister(id);
  return true;
}

/** Launch handles still registered (for tests and leak checks). */
export function liveLaunchWidgetHandleCount(): number {
  return launchHandleIds.size;
}

/** The write-back a conversation's launch carried, if any. */
export function getSelectionWriteBack(
  widgetHandleId: string | null | undefined,
): SelectionWriteBack | null {
  if (!widgetHandleId) return null;
  return callbackManager.get<WidgetHandle>(widgetHandleId)?.selection ?? null;
}
