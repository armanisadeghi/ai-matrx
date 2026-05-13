/**
 * ImageUploaderWindow callbacks.
 *
 * The window talks back to the page that opened it via the global
 * `callbackManager`. Contract mirrors the content-editor windows:
 *
 *   1. Caller creates a callback GROUP via `createImageUploaderCallbackGroup`
 *      and registers any subset of lifecycle handlers (onUploaded, onCleared, …).
 *   2. The returned `callbackGroupId` is passed through `openOverlay` data.
 *   3. The window subscribes to that group and emits typed events as the user
 *      uploads, pastes a URL, removes the image, or closes the window.
 *   4. Caller `dispose()`s the group when it no longer needs events.
 *
 * No upload state is stored in Redux — Redux only tracks "is open" + the
 * initial payload. The callback group is the live channel back to the caller.
 */

import { callbackManager } from "@/utils/callbackManager";
import type { AssetPreset } from "@/features/files/types";
import type { ImageUploaderResult } from "@/components/official/ImageAssetUploader";

// ─── Event surface ───────────────────────────────────────────────────────────

export type ImageUploaderWindowEventType =
    | "ready"
    | "uploaded"
    | "cleared"
    | "window-close";

export interface ImageUploaderWindowEventBase {
    type: ImageUploaderWindowEventType;
    windowInstanceId: string;
}

export interface ImageUploaderReadyEvent extends ImageUploaderWindowEventBase {
    type: "ready";
}

export interface ImageUploaderUploadedEvent extends ImageUploaderWindowEventBase {
    type: "uploaded";
    result: ImageUploaderResult;
    /** Whether the URLs came from a new upload or the user pasted a public URL. */
    source: "upload" | "url";
}

export interface ImageUploaderClearedEvent extends ImageUploaderWindowEventBase {
    type: "cleared";
}

export interface ImageUploaderWindowCloseEvent
    extends ImageUploaderWindowEventBase {
    type: "window-close";
    /** Last emitted result, if any. Convenience so callers can grab final state. */
    lastResult: ImageUploaderResult | null;
}

export type ImageUploaderWindowEvent =
    | ImageUploaderReadyEvent
    | ImageUploaderUploadedEvent
    | ImageUploaderClearedEvent
    | ImageUploaderWindowCloseEvent;

// ─── Caller-facing handler surface ───────────────────────────────────────────

export interface ImageUploaderWindowHandlers {
    onReady?: (e: ImageUploaderReadyEvent) => void;
    /** Called after every successful upload or URL paste. */
    onUploaded?: (e: ImageUploaderUploadedEvent) => void;
    /** Called when the user removes the image. */
    onCleared?: (e: ImageUploaderClearedEvent) => void;
    /** Called when the window is closed (by the user, close API, or anything else). */
    onWindowClose?: (e: ImageUploaderWindowCloseEvent) => void;
    /** Catch-all for any emitted event. */
    onEvent?: (e: ImageUploaderWindowEvent) => void;
}

// ─── Window-side data payload (initial + overlay data) ───────────────────────

export interface ImageUploaderWindowData {
    callbackGroupId?: string | null;
    preset?: AssetPreset;
    folder?: string;
    title?: string | null;
    description?: string | null;
    currentUrl?: string | null;
    allowUrlPaste?: boolean;
}

// ─── Group creation / disposal ───────────────────────────────────────────────

export function createImageUploaderCallbackGroup(
    handlers: ImageUploaderWindowHandlers,
): { callbackGroupId: string; dispose: () => void } {
    const callbackGroupId = callbackManager.createGroup();

    const fanOut = (event: ImageUploaderWindowEvent) => {
        switch (event.type) {
            case "ready":
                handlers.onReady?.(event);
                break;
            case "uploaded":
                handlers.onUploaded?.(event);
                break;
            case "cleared":
                handlers.onCleared?.(event);
                break;
            case "window-close":
                handlers.onWindowClose?.(event);
                break;
        }
        handlers.onEvent?.(event);
    };

    callbackManager.registerWithContext<ImageUploaderWindowEvent>(
        (event) => fanOut(event),
        { groupId: callbackGroupId },
    );

    return {
        callbackGroupId,
        dispose: () => callbackManager.removeGroup(callbackGroupId),
    };
}

export function emitImageUploaderEvent(
    callbackGroupId: string | undefined | null,
    event: ImageUploaderWindowEvent,
): void {
    if (!callbackGroupId) return;
    callbackManager.triggerGroup<ImageUploaderWindowEvent>(
        callbackGroupId,
        event,
        { removeAfterTrigger: false },
    );
}
