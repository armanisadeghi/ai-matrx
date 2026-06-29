"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Clipboard, ImageIcon, Lightbulb, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface StudioDropZoneProps {
    onFilesAdded: (files: File[]) => void;
    /** Compact appearance for use when there are already files. */
    compact?: boolean;
    /** Paste-to-upload — listens at document level when true. */
    listenForPaste?: boolean;
}

export function StudioDropZone({
    onFilesAdded,
    compact = false,
    listenForPaste = true,
}: StudioDropZoneProps) {
    const [pastedFlash, setPastedFlash] = useState(false);
    const flashRef = useRef<number | null>(null);

    const onDrop = useCallback(
        (accepted: File[]) => {
            if (accepted.length > 0) onFilesAdded(accepted);
        },
        [onFilesAdded],
    );

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: {
            "image/*": [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".avif", ".tiff", ".bmp"],
        },
        multiple: true,
        noClick: false,
        noKeyboard: false,
    });

    // Paste support at the document level
    useEffect(() => {
        if (!listenForPaste) return undefined;
        const handler = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            const files: File[] = [];
            for (const item of Array.from(items)) {
                if (item.type.startsWith("image/")) {
                    const f = item.getAsFile();
                    if (f) {
                        const ext = f.type.split("/")[1] || "png";
                        files.push(
                            new File([f], `pasted-${Date.now()}.${ext}`, { type: f.type }),
                        );
                    }
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                onFilesAdded(files);
                setPastedFlash(true);
                if (flashRef.current) window.clearTimeout(flashRef.current);
                flashRef.current = window.setTimeout(
                    () => setPastedFlash(false),
                    1500,
                );
            }
        };
        document.addEventListener("paste", handler);
        return () => {
            document.removeEventListener("paste", handler);
            if (flashRef.current) window.clearTimeout(flashRef.current);
        };
    }, [listenForPaste, onFilesAdded]);

    if (compact) {
        return (
            <div
                {...getRootProps()}
                className={cn(
                    "relative flex items-center justify-between gap-3 rounded-xl border-2 border-dashed p-3 transition-all cursor-pointer",
                    isDragActive
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/30",
                )}
            >
                <input {...getInputProps()} />
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Upload className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-sm">
                        <p className="font-medium">
                            {isDragActive ? "Drop to add" : "Add more images"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Drag &amp; drop, click, or paste
                        </p>
                    </div>
                </div>
                {pastedFlash && (
                    <span className="text-xs text-primary font-medium animate-pulse flex items-center gap-1">
                        <Clipboard className="h-3 w-3" /> Pasted
                    </span>
                )}
            </div>
        );
    }

    return (
        <div
            {...getRootProps()}
            className={cn(
                "relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-all cursor-pointer min-h-[260px]",
                isDragActive
                    ? "border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-transparent scale-[1.01]"
                    : "border-border hover:border-primary/50 hover:bg-muted/20",
            )}
        >
            <input {...getInputProps()} />
            <div
                className={cn(
                    "h-16 w-16 rounded-2xl flex items-center justify-center transition-transform",
                    isDragActive
                        ? "bg-primary text-primary-foreground scale-110"
                        : "bg-primary/10 text-primary",
                )}
            >
                {isDragActive ? (
                    <Lightbulb className="h-8 w-8" />
                ) : (
                    <ImageIcon className="h-8 w-8" />
                )}
            </div>
            <div className="space-y-1">
                <h3 className="text-lg font-semibold">
                    {isDragActive ? "Drop to start processing" : "Drop images to begin"}
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                    Drag &amp; drop one or many images, click to browse, or paste from
                    clipboard. JPG, PNG, WebP, GIF, HEIC, AVIF, TIFF — up to 25 MB each.
                </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                <kbd className="rounded-md bg-muted px-2 py-0.5 font-mono">⌘/Ctrl&nbsp;V</kbd>
                <span>paste</span>
                <span className="opacity-50">·</span>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        open();
                    }}
                    className="underline hover:text-foreground"
                >
                    browse files
                </button>
            </div>
            {pastedFlash && (
                <div className="absolute top-3 right-3 text-xs text-primary font-medium animate-pulse flex items-center gap-1">
                    <Clipboard className="h-3 w-3" /> Pasted from clipboard
                </div>
            )}
        </div>
    );
}
