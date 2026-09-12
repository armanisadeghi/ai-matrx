/**
 * Reference picker overlay callbacks.
 *
 * The `referencePicker` overlay hands the picked reference back to whoever
 * opened it — a handler that cannot travel through Redux. Same contract as
 * `findReplace`: the opener registers a callback GROUP, only the group id
 * rides `openOverlay` data, the overlay resolves it, the opener disposes it.
 */

import { callbackManager } from "@/utils/callbackManager";
import type { ReferencePick } from "@/features/matrx-envelope/components/reference-picker/referencePickerTypes";

export interface ReferencePickerCallbackGroup {
  onPicked: (pick: ReferencePick) => void;
  /** Fired when the picker closes without a pick. */
  onCancelled?: () => void;
}

export function createReferencePickerCallbackGroup(
  group: ReferencePickerCallbackGroup,
): { callbackGroupId: string; dispose: () => void } {
  // MATRX-EXCEPTION: stored as a non-callable payload, retrieved via `get`,
  // never `trigger`ed — the same convention as `createFindReplaceCallbackGroup`.
  const callbackGroupId = callbackManager.register(
    group as unknown as () => void,
  );
  return {
    callbackGroupId,
    dispose: () => callbackManager.unregister(callbackGroupId),
  };
}

export function getReferencePickerCallbackGroup(
  callbackGroupId: string | null | undefined,
): ReferencePickerCallbackGroup | null {
  if (!callbackGroupId) return null;
  return (
    callbackManager.get<ReferencePickerCallbackGroup>(callbackGroupId) ?? null
  );
}

export function disposeReferencePickerCallbackGroup(
  callbackGroupId: string | null | undefined,
): void {
  if (callbackGroupId) callbackManager.unregister(callbackGroupId);
}
