"use client";

/**
 * useOpenImageUploaderWindow
 *
 * Imperative opener for `ImageUploaderWindow`. Callers get back a handle
 * that can close the window or detach the callback group without closing.
 *
 * Usage:
 *
 *   const openUploader = useOpenImageUploaderWindow();
 *   const handle = openUploader({
 *     preset: "logo",
 *     title: "Upload organization logo",
 *     currentUrl: form.logoUrl,
 *     onUploaded: (e) => setLogoUrl(e.result.primary_url),
 *     onCleared:  () => setLogoUrl(""),
 *   });
 *   // later
 *   handle.close();
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
    createImageUploaderCallbackGroup,
    type ImageUploaderWindowHandlers,
    type ImageUploaderWindowData,
} from "./callbacks";
import type { AssetPreset } from "@/features/files/types";

const OVERLAY_ID = "imageUploaderWindow";

export interface OpenImageUploaderWindowOptions
    extends ImageUploaderWindowHandlers {
    /** Optional stable instance id. Omit for a unique new window each call. */
    windowInstanceId?: string;
    preset?: AssetPreset;
    folder?: string;
    title?: string | null;
    description?: string | null;
    currentUrl?: string | null;
    allowUrlPaste?: boolean;
}

export interface ImageUploaderWindowHandle {
    overlayId: string;
    instanceId: string;
    callbackGroupId: string;
    /** Close the window AND dispose the callback group. */
    close: () => void;
    /** Leave the window open; stop receiving events. */
    dispose: () => void;
}

type HandleRef = {
    instanceId: string;
    callbackGroupId: string;
    dispose: () => void;
};

export function useOpenImageUploaderWindow() {
    const dispatch = useAppDispatch();
    const handlesRef = useRef<Set<HandleRef>>(new Set());

    useEffect(() => {
        const handles = handlesRef.current;
        return () => {
            for (const h of handles) h.dispose();
            handles.clear();
        };
    }, []);

    const open = useCallback(
        (options: OpenImageUploaderWindowOptions): ImageUploaderWindowHandle => {
            const instanceId =
                options.windowInstanceId ?? `${OVERLAY_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

            const { callbackGroupId, dispose } = createImageUploaderCallbackGroup({
                onReady: options.onReady,
                onUploaded: options.onUploaded,
                onCleared: options.onCleared,
                onWindowClose: options.onWindowClose,
                onEvent: options.onEvent,
            });

            const data: ImageUploaderWindowData = {
                callbackGroupId,
                preset: options.preset ?? "social",
                folder: options.folder,
                title: options.title ?? null,
                description: options.description ?? null,
                currentUrl: options.currentUrl ?? null,
                allowUrlPaste: options.allowUrlPaste ?? true,
            };

            dispatch(openOverlay({ overlayId: OVERLAY_ID, instanceId, data }));

            const handleRef: HandleRef = { instanceId, callbackGroupId, dispose };
            handlesRef.current.add(handleRef);

            const close = () => {
                dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId }));
                dispose();
                handlesRef.current.delete(handleRef);
            };

            const detach = () => {
                dispose();
                handlesRef.current.delete(handleRef);
            };

            return {
                overlayId: OVERLAY_ID,
                instanceId,
                callbackGroupId,
                close,
                dispose: detach,
            };
        },
        [dispatch],
    );

    return open;
}
