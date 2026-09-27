/**
 * Resource picker window overlay callbacks.
 *
 * Opened by a resource picker's ⌘K hand-off when the bar runs one of the
 * picker's own commands (Upload, URL entry, Voice, Tools…) and the host cannot
 * re-open its own popover: the same `ResourcePickerMenu`, at that view, in a
 * window, wired to the HOST's own handlers — so every pick goes exactly where
 * a pick in the host's picker would. Handlers cannot travel through Redux, so
 * they ride a callback group (same contract as `referencePicker`).
 */

import { callbackManager } from "@/utils/callbackManager";
import type { Resource } from "@/features/agents/resources/types";
import type { ResourcePickerViewId } from "@/features/resource-manager/resource-picker/resource-picker-menu-items";

export interface ResourcePickerWindowCallbackGroup {
  onResourceSelected: (resource: Resource) => boolean | void | Promise<boolean | void>;
  onResourceDeselected?: (resource: Resource) => boolean | void | Promise<boolean | void>;
  conversationId?: string;
  attachmentCapabilities?: {
    supportsImageUrls?: boolean;
    supportsFileUrls?: boolean;
    supportsYoutubeVideos?: boolean;
    supportsAudio?: boolean;
  };
  allowedViewIds?: readonly Exclude<ResourcePickerViewId, null>[];
  selectionMode?: "single" | "multiple";
}

export function createResourcePickerWindowCallbackGroup(
  group: ResourcePickerWindowCallbackGroup,
): { callbackGroupId: string; dispose: () => void } {
  // MATRX-EXCEPTION: stored as a non-callable payload, retrieved via `get`,
  // never `trigger`ed — the same convention as `createReferencePickerCallbackGroup`.
  const callbackGroupId = callbackManager.register(group as unknown as () => void);
  return {
    callbackGroupId,
    dispose: () => callbackManager.unregister(callbackGroupId),
  };
}

export function getResourcePickerWindowCallbackGroup(
  callbackGroupId: string | null | undefined,
): ResourcePickerWindowCallbackGroup | null {
  if (!callbackGroupId) return null;
  return callbackManager.get<ResourcePickerWindowCallbackGroup>(callbackGroupId) ?? null;
}

export function disposeResourcePickerWindowCallbackGroup(
  callbackGroupId: string | null | undefined,
): void {
  if (callbackGroupId) callbackManager.unregister(callbackGroupId);
}
