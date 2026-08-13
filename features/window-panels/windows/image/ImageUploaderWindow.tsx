"use client";

/**
 * ImageUploaderWindow
 *
 * Floating WindowPanel wrapper around the ImageAssetUploader official
 * component. The window lets any caller spawn a full-size upload surface,
 * get back the resulting variant URLs via `callbackManager`, and close
 * itself once done.
 *
 * Ephemeral — callback groups can't survive a reload, so geometry-only
 * persistence would be misleading. Open it fresh every time.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
    ImageAssetUploader,
    type ImageUploaderResult,
} from "@/components/official/ImageAssetUploader";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
    IMAGE_UPLOADER_SURFACE_NAME,
    createImageUploaderScope,
} from "@/features/surfaces/manifests/image-uploader.manifest";
import { emitImageUploaderEvent } from "./callbacks";
import type { AssetPreset } from "@/features/files/types";

/**
 * Flatten the asset's variant map to `{ variantKey: url }`, dropping variants
 * the backend produced without a resolvable URL. Returns undefined when there
 * is nothing to report so the value reads as absent rather than as `{}`.
 */
function toVariantUrlMap(
    result: ImageUploaderResult | null,
): Record<string, string> | undefined {
    if (!result) return undefined;
    const urls: Record<string, string> = {};
    for (const [key, variant] of Object.entries(result.variants ?? {})) {
        if (variant?.url) urls[key] = variant.url;
    }
    return Object.keys(urls).length > 0 ? urls : undefined;
}

export interface ImageUploaderWindowProps {
    isOpen: boolean;
    onClose: () => void;
    instanceId: string;

    callbackGroupId?: string | null;
    preset?: AssetPreset;
    folder?: string;
    title?: string | null;
    description?: string | null;
    currentUrl?: string | null;
    allowUrlPaste?: boolean;
}

export default function ImageUploaderWindow({
    isOpen,
    onClose,
    instanceId,
    callbackGroupId,
    preset = "social",
    folder,
    title,
    description,
    currentUrl,
    allowUrlPaste = true,
}: ImageUploaderWindowProps) {
    const [result, setResult] = useState<ImageUploaderResult | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const lastResultRef = useRef<ImageUploaderResult | null>(null);
    const emittedReadyRef = useRef(false);

    useEffect(() => {
        if (emittedReadyRef.current) return;
        emittedReadyRef.current = true;
        emitImageUploaderEvent(callbackGroupId, {
            type: "ready",
            windowInstanceId: instanceId,
        });
    }, [callbackGroupId, instanceId]);

    const handleComplete = useCallback(
        (r: ImageUploaderResult | null) => {
            setResult(r);
            lastResultRef.current = r;
            // A later success supersedes an earlier failure — the uploader
            // never calls back to clear its own error.
            if (r !== null) setLastError(null);
            if (r === null) {
                emitImageUploaderEvent(callbackGroupId, {
                    type: "cleared",
                    windowInstanceId: instanceId,
                });
                return;
            }
            emitImageUploaderEvent(callbackGroupId, {
                type: "uploaded",
                windowInstanceId: instanceId,
                result: r,
                source: "upload",
            });
        },
        [callbackGroupId, instanceId],
    );

    const handleDone = useCallback(() => {
        emitImageUploaderEvent(callbackGroupId, {
            type: "window-close",
            windowInstanceId: instanceId,
            lastResult: lastResultRef.current,
        });
        onClose();
    }, [callbackGroupId, instanceId, onClose]);

    const handleClose = useCallback(() => {
        emitImageUploaderEvent(callbackGroupId, {
            type: "window-close",
            windowInstanceId: instanceId,
            lastResult: lastResultRef.current,
        });
        onClose();
    }, [callbackGroupId, instanceId, onClose]);

    if (!isOpen) return null;

    return (
        // Overlay emitter — while this window is open, its scope out-depths the
        // page's provider (deepest wins), so the Agents chrome reads the
        // uploader rather than whatever route is behind it. `getScope` stays
        // SYNCHRONOUS over live render state: the Surface Context window
        // samples it every 400ms for as long as it is open.
        <SurfaceRuntimeProvider
            surfaceName={IMAGE_UPLOADER_SURFACE_NAME}
            getScope={() =>
                createImageUploaderScope({
                    window_instance_id: instanceId,
                    preset,
                    allow_url_paste: allowUrlPaste,
                    has_upload_result: result !== null,
                    target_folder: folder || undefined,
                    uploader_title: title ?? undefined,
                    uploader_description: description ?? undefined,
                    current_url: currentUrl ?? undefined,
                    result_primary_url: result?.primary_url ?? undefined,
                    result_file_id: result?.file_id || undefined,
                    result_variant_urls: toVariantUrlMap(result),
                    last_error: lastError ?? undefined,
                })
            }
        >
            <WindowPanel
                id={`image-uploader-window-${instanceId}`}
                title={title ?? "Upload Image"}
                onClose={handleClose}
                overlayId="imageUploaderWindow"
                minWidth={380}
                minHeight={340}
                width={520}
                height={460}
                position="center"
                footerRight={
                    <button
                        type="button"
                        onClick={handleDone}
                        disabled={!result}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <Check className="w-3 h-3" />
                        Use image
                    </button>
                }
                footerLeft={
                    <button
                        type="button"
                        onClick={handleClose}
                        className="px-2.5 py-1 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                }
            >
                <div className="flex flex-col gap-3 p-4 overflow-auto h-full">
                    {description && (
                        <p
                            className="text-xs text-muted-foreground"
                            data-surface-value="uploader_description"
                        >
                            {description}
                        </p>
                    )}
                    <ImageAssetUploader
                        onComplete={handleComplete}
                        onError={setLastError}
                        preset={preset}
                        folder={folder}
                        currentUrl={currentUrl ?? null}
                        allowUrlPaste={allowUrlPaste}
                        label={title ?? "Image"}
                    />
                    {result && (
                        <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs">
                            <p className="font-medium mb-1">Primary URL</p>
                            <p
                                className="font-mono text-[11px] break-all text-muted-foreground"
                                data-surface-value="result_primary_url"
                            >
                                {result.primary_url}
                            </p>
                        </div>
                    )}
                </div>
            </WindowPanel>
        </SurfaceRuntimeProvider>
    );
}
