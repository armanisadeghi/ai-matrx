/**
 * CreateProjectWindow callbacks.
 *
 * The window talks back to the page that opened it via the global
 * `callbackManager`, mirroring the curated-icon-picker / image-uploader
 * contract:
 *
 *   1. Caller creates a callback GROUP via `createCreateProjectCallbackGroup`
 *      and registers any subset of lifecycle handlers (onCreated, onWindowClose).
 *   2. The returned `callbackGroupId` is passed through `openOverlay` data.
 *   3. The window emits a typed `created` event when a project is created and a
 *      `window-close` event when it closes.
 *   4. Caller `dispose()`s the group when it no longer needs events.
 *
 * No project state is stored in Redux — Redux only tracks "is open" + the
 * initial payload (org pre-selection). The callback group is the live channel
 * back to the caller; that's how the War Room project picker auto-selects the
 * freshly created project.
 */

import { callbackManager } from "@/utils/callbackManager";
import type { Project } from "@/features/projects/types";

// ─── Event surface ───────────────────────────────────────────────────────────

export type CreateProjectWindowEventType = "created" | "window-close";

export interface CreateProjectWindowEventBase {
  type: CreateProjectWindowEventType;
  windowInstanceId: string;
}

export interface CreateProjectCreatedEvent
  extends CreateProjectWindowEventBase {
  type: "created";
  project: Project;
}

export interface CreateProjectWindowCloseEvent
  extends CreateProjectWindowEventBase {
  type: "window-close";
  /** The last project created in this window, if any. */
  lastProject: Project | null;
}

export type CreateProjectWindowEvent =
  | CreateProjectCreatedEvent
  | CreateProjectWindowCloseEvent;

// ─── Caller-facing handler surface ───────────────────────────────────────────

export interface CreateProjectWindowHandlers {
  /** Called with the newly created project right after creation succeeds. */
  onCreated?: (e: CreateProjectCreatedEvent) => void;
  /** Called when the window closes (user, close API, or anything else). */
  onWindowClose?: (e: CreateProjectWindowCloseEvent) => void;
  /** Catch-all for any emitted event. */
  onEvent?: (e: CreateProjectWindowEvent) => void;
}

// ─── Window-side data payload (initial + overlay data) ───────────────────────

export interface CreateProjectWindowData {
  callbackGroupId?: string | null;
  /** Pre-set the owner org. `null` forces a Personal project. Omit to let the
   * user choose. When provided, the owner selector is locked. */
  initialOrgId?: string | null;
  initialOrgSlug?: string | null;
  orgLocked?: boolean;
  /** When true, the success toast won't offer an "Open Settings" redirect. */
  skipRedirect?: boolean;
}

// ─── Group creation / disposal ───────────────────────────────────────────────

export function createCreateProjectCallbackGroup(
  handlers: CreateProjectWindowHandlers,
): { callbackGroupId: string; dispose: () => void } {
  const callbackGroupId = callbackManager.createGroup();

  const fanOut = (event: CreateProjectWindowEvent) => {
    switch (event.type) {
      case "created":
        handlers.onCreated?.(event);
        break;
      case "window-close":
        handlers.onWindowClose?.(event);
        break;
    }
    handlers.onEvent?.(event);
  };

  callbackManager.registerWithContext<CreateProjectWindowEvent>(
    (event) => fanOut(event),
    { groupId: callbackGroupId },
  );

  return {
    callbackGroupId,
    dispose: () => callbackManager.removeGroup(callbackGroupId),
  };
}

export function emitCreateProjectEvent(
  callbackGroupId: string | undefined | null,
  event: CreateProjectWindowEvent,
): void {
  if (!callbackGroupId) return;
  callbackManager.triggerGroup<CreateProjectWindowEvent>(
    callbackGroupId,
    event,
    { removeAfterTrigger: false },
  );
}
