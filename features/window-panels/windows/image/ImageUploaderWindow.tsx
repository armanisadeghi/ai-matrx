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
import { emitImageUploaderEvent } from "./callbacks";
import type { AssetPreset } from "@/features/files";

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
                    <p className="text-xs text-muted-foreground">{description}</p>
                )}
                <ImageAssetUploader
                    onComplete={handleComplete}
                    preset={preset}
                    folder={folder}
                    currentUrl={currentUrl ?? null}
                    allowUrlPaste={allowUrlPaste}
                    label={title ?? "Image"}
                />
                {result && (
                    <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs">
                        <p className="font-medium mb-1">Primary URL</p>
                        <p className="font-mono text-[11px] break-all text-muted-foreground">
                            {result.primary_url}
                        </p>
                    </div>
                )}
            </div>
        </WindowPanel>
    );
}
