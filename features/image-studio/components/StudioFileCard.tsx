"use client";

import React, { useRef, useState } from "react";
import {
    AlertCircle,
    Check,
    ChevronDown,
    ChevronUp,
    Edit3,
    Eye,
    FileImage,
    Loader2,
    Trash2,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImageMetadata, StudioSourceFile } from "../types";
import { formatBytes, formatDimensions } from "../utils/format-bytes";
import {
    StudioVariantTile,
    VariantTileGrid,
    StudioVariantTilePending,
    StudioVariantTileError,
} from "./StudioVariantTile";
import { MetadataPanel } from "./MetadataPanel";
import { MousePointerClick } from "lucide-react";

interface StudioFileCardProps {
    file: StudioSourceFile;
    /** Currently selected preset ids (shows pending tiles when processing). */
    selectedPresetIds: string[];
    /** Variant filenames that are selected for bundled actions. */
    selectedVariantFilenames: Set<string>;
    /** True when the crop preview window is currently focused on this file. */
    isPreviewActive?: boolean;
    onToggleVariantSelect: (filename: string) => void;
    onRemove: () => void;
    onRename: (base: string) => void;
    /** Open the live crop preview window, pointed at this file. */
    onPreviewRequested?: () => void;
    /** True while this file is currently being described by the AI. */
    isDescribing?: boolean;
    /** Trigger the describe-with-AI flow for this file. */
    onDescribe?: () => void;
    /** Edit the file's image metadata in place. */
    onMetadataPatch?: (patch: Partial<ImageMetadata>) => void;
    /** Drop the AI-authored metadata for this file. */
    onMetadataClear?: () => void;
    /**
     * Highlight the rename pencil — used by the auto-name banner to draw
     * the eye toward files that still carry an auto-derived filename.
     */
    needsRename?: boolean;
    /**
     * Register an imperative "open the rename input + focus" action with
     * the parent. Called once on mount and on unmount with `null`.
     */
    registerRenameAction?: (
        fileId: string,
        action: (() => void) | null,
    ) => void;
}

export function StudioFileCard({
    file,
    selectedPresetIds,
    selectedVariantFilenames,
    isPreviewActive,
    onToggleVariantSelect,
    onRemove,
    onRename,
    onPreviewRequested,
    isDescribing = false,
    onDescribe,
    onMetadataPatch,
    onMetadataClear,
    needsRename = false,
    registerRenameAction,
}: StudioFileCardProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [rawBase, setRawBase] = useState(file.filenameBase);
    const renameInputRef = useRef<HTMLInputElement | null>(null);
    const variantList = Object.values(file.variants);

    // Imperative rename trigger so the shell's auto-name banner can scroll
    // to + open this card's rename input from afar. The renameInputRef has
    // `autoFocus` attached so we just flip into renaming mode and the next
    // microtask lands focus + selection on the input.
    React.useEffect(() => {
        if (!registerRenameAction) return undefined;
        const action = () => {
            setRawBase(file.filenameBase);
            setRenaming(true);
            requestAnimationFrame(() => {
                const el = renameInputRef.current;
                if (el) {
                    el.focus();
                    el.select();
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            });
        };
        registerRenameAction(file.id, action);
        return () => registerRenameAction(file.id, null);
    }, [registerRenameAction, file.id, file.filenameBase]);

    // Which preset ids are still to be processed?
    const pendingPresetIds = selectedPresetIds.filter(
        (id) => !(id in file.variants),
    );

    const isProcessing = file.status === "processing";
    const hasError = file.status === "error";

    const commitRename = () => {
        onRename(rawBase);
        setRenaming(false);
    };

    return (
        <section className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
            {/* Header ────────────────────────────────────────── */}
            <header className="flex items-center gap-3 p-3 border-b border-border bg-muted/20">
                {/* Thumbnail */}
                <div className="relative h-14 w-14 rounded-lg overflow-hidden border border-border bg-muted/50 flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={file.objectUrl}
                        alt={file.originalName}
                        className="h-full w-full object-cover"
                    />
                    {isProcessing && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    {/* Filename base — editable */}
                    {renaming ? (
                        <div className="flex items-center gap-1">
                            <input
                                ref={renameInputRef}
                                type="text"
                                value={rawBase}
                                onChange={(e) => setRawBase(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") commitRename();
                                    if (e.key === "Escape") {
                                        setRawBase(file.filenameBase);
                                        setRenaming(false);
                                    }
                                }}
                                autoFocus
                                className="h-7 flex-1 text-sm font-mono rounded-md border border-border bg-background px-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="my-image"
                            />
                            <button
                                type="button"
                                onClick={commitRename}
                                className="h-7 w-7 rounded-md hover:bg-accent text-success flex items-center justify-center"
                                title="Save"
                            >
                                <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setRawBase(file.filenameBase);
                                    setRenaming(false);
                                }}
                                className="h-7 w-7 rounded-md hover:bg-accent text-muted-foreground flex items-center justify-center"
                                title="Cancel"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5">
                            <p
                                className={cn(
                                    "font-mono text-sm truncate",
                                    needsRename && "text-amber-600 dark:text-amber-400",
                                )}
                                title={file.filenameBase}
                            >
                                {file.filenameBase}
                            </p>
                            <button
                                type="button"
                                onClick={() => setRenaming(true)}
                                className={cn(
                                    "h-5 w-5 rounded flex items-center justify-center transition-colors",
                                    needsRename
                                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 ring-1 ring-amber-500/40"
                                        : "hover:bg-accent text-muted-foreground hover:text-foreground",
                                )}
                                title={
                                    needsRename
                                        ? "Auto-generated name — click to rename before generating variants"
                                        : "Rename filename base"
                                }
                            >
                                <Edit3 className="h-3 w-3" />
                            </button>
                            {needsRename && (
                                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap">
                                    auto-named
                                </span>
                            )}
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <FileImage className="h-3 w-3" />
                        <span className="truncate">{file.originalName}</span>
                        <span>·</span>
                        <span className="font-mono whitespace-nowrap">
                            {formatDimensions(file.width, file.height)}
                        </span>
                        <span>·</span>
                        <span className="font-mono whitespace-nowrap">
                            {formatBytes(file.size)}
                        </span>
                    </div>
                </div>

                {/* Status / actions */}
                <div className="flex items-center gap-1">
                    {variantList.length > 0 && (
                        <span className="rounded-full bg-primary/10 border border-primary/30 text-primary px-2 py-0.5 text-[11px] font-medium">
                            {variantList.length}{" "}
                            {variantList.length === 1 ? "variant" : "variants"}
                        </span>
                    )}
                    {hasError && (
                        <span className="rounded-full bg-destructive/10 border border-destructive/30 text-destructive px-2 py-0.5 text-[11px] font-medium flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> Error
                        </span>
                    )}
                    {onPreviewRequested && (
                        <button
                            type="button"
                            onClick={onPreviewRequested}
                            className={
                                isPreviewActive
                                    ? "h-7 rounded-md border border-primary bg-primary/10 text-primary px-2 text-[11px] font-medium flex items-center gap-1"
                                    : "h-7 rounded-md border border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-foreground px-2 text-[11px] font-medium flex items-center gap-1"
                            }
                            title={
                                isPreviewActive
                                    ? "Preview window is focused on this file"
                                    : "Open the live crop preview for this file"
                            }
                        >
                            <Eye className="h-3 w-3" />
                            {isPreviewActive ? "Previewing" : "Preview"}
                        </button>
                    )}
                    {onDescribe && (
                        <button
                            type="button"
                            onClick={onDescribe}
                            disabled={isDescribing}
                            className={cn(
                                "h-7 rounded-md border px-2 text-[11px] font-medium flex items-center gap-1 transition-colors",
                                file.imageMetadata
                                    ? "border-success/40 bg-success/10 text-success hover:bg-success/15"
                                    : "border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-foreground",
                                isDescribing && "cursor-wait opacity-70",
                            )}
                            title={
                                file.imageMetadata
                                    ? "Re-describe with AI"
                                    : "Generate filename + alt text + caption + SEO + colours"
                            }
                        >
                            {isDescribing ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <MousePointerClick className="h-3 w-3" />
                            )}
                            {isDescribing
                                ? "Describing"
                                : file.imageMetadata
                                  ? "Described"
                                  : "Describe"}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setCollapsed((v) => !v)}
                        className="h-8 w-8 rounded-md hover:bg-accent text-muted-foreground flex items-center justify-center"
                        title={collapsed ? "Expand" : "Collapse"}
                    >
                        {collapsed ? (
                            <ChevronDown className="h-4 w-4" />
                        ) : (
                            <ChevronUp className="h-4 w-4" />
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onRemove}
                        className="h-8 w-8 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center"
                        title="Remove this file"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </header>

            {/* Body ────────────────────────────────────────── */}
            {!collapsed && (
                <div className="p-3">
                    {hasError && (
                        <p className="mb-3 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive flex items-center gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            {file.error}
                        </p>
                    )}
                    {variantList.length === 0 && pendingPresetIds.length === 0 && !isProcessing && (
                        <div className="rounded-lg border border-dashed border-border bg-muted/10 p-6 text-center">
                            <p className="text-sm text-muted-foreground">
                                Pick presets from the catalog on the left, then press{" "}
                                <span className="font-medium text-foreground">Generate</span>.
                            </p>
                        </div>
                    )}

                    {(variantList.length > 0 || pendingPresetIds.length > 0) && (
                        <VariantTileGrid>
                            {/* Processed variants */}
                            {variantList.map((v) => (
                                <StudioVariantTile
                                    key={v.presetId}
                                    variant={v}
                                    selected={selectedVariantFilenames.has(v.filename)}
                                    onToggleSelect={() => onToggleVariantSelect(v.filename)}
                                />
                            ))}
                            {/* Pending variants (while processing) */}
                            {isProcessing &&
                                pendingPresetIds.map((id) => (
                                    <StudioVariantTilePending key={`p-${id}`} presetId={id} />
                                ))}
                        </VariantTileGrid>
                    )}

                    {onDescribe && onMetadataPatch && onMetadataClear && (
                        <div className="mt-3">
                            <MetadataPanel
                                file={file}
                                isDescribing={isDescribing}
                                onDescribe={onDescribe}
                                onClear={onMetadataClear}
                                onPatch={onMetadataPatch}
                            />
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
