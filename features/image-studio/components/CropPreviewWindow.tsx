"use client";

/**
 * @registry-status: inline-window
 * CropPreviewWindow
 *
 * Floating preview panel. Shows the active source image and the selected
 * preset as a two-pane live preview, updating on every change to fit,
 * position, or background colour. The user can switch between files and
 * presets from inside the window.
 *
 * Rendered inline by `ImageStudioShell` — not registered in windowRegistry
 * because its state is driven by the shell's props, not Redux. Do NOT
 * convert to a registered overlay without first wrapping its callback API
 * in a callback-bus group (see ImageUploaderWindow).
 */

import React, { useCallback, useEffect, useMemo } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Eye,
    ImageIcon,
    Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { CropPreview } from "./CropPreview";
import { MiniFocalPointPicker } from "./MiniFocalPointPicker";
import { ALL_PRESETS, getPresetById } from "../presets";
import type {
    ImageFit,
    ImagePosition,
    StudioSourceFile,
} from "../types";

interface CropPreviewWindowProps {
    /** Every file currently loaded in the studio. */
    files: StudioSourceFile[];
    /** Every preset the user has picked. */
    selectedPresetIds: string[];

    /** The file currently mirrored in the preview. */
    activeFileId: string | null;
    /** The preset currently mirrored in the preview. */
    activePresetId: string | null;

    onActiveFileChange: (fileId: string) => void;
    onActivePresetChange: (presetId: string) => void;

    /** Global fit / position / bg come from the studio. */
    fit: ImageFit;
    position: ImagePosition;
    backgroundColor: string;

    /** Lets the preview window drive the global focal point too. */
    onPositionChange: (p: ImagePosition) => void;

    onClose: () => void;
}

export function CropPreviewWindow({
    files,
    selectedPresetIds,
    activeFileId,
    activePresetId,
    onActiveFileChange,
    onActivePresetChange,
    fit,
    position,
    backgroundColor,
    onPositionChange,
    onClose,
}: CropPreviewWindowProps) {
    const activeFile = useMemo(
        () => files.find((f) => f.id === activeFileId) ?? files[0] ?? null,
        [files, activeFileId],
    );

    // When the user hasn't picked any presets yet we still want the preview
    // to be useful. Fall back to the entire catalog so they can experiment
    // with shapes before committing to a bundle.
    const previewablePresetIds = useMemo(
        () =>
            selectedPresetIds.length > 0
                ? selectedPresetIds
                : ALL_PRESETS.map((p) => p.id),
        [selectedPresetIds],
    );
    const previewingAll = selectedPresetIds.length === 0;

    const activePreset = useMemo(
        () =>
            (activePresetId ? getPresetById(activePresetId) : null) ??
            (previewablePresetIds[0]
                ? getPresetById(previewablePresetIds[0])
                : null),
        [activePresetId, previewablePresetIds],
    );

    // Fall back to first-available values when state drifts.
    useEffect(() => {
        if (!activeFile && files[0]) onActiveFileChange(files[0].id);
    }, [activeFile, files, onActiveFileChange]);
    useEffect(() => {
        if (
            previewablePresetIds.length > 0 &&
            (!activePresetId || !previewablePresetIds.includes(activePresetId))
        ) {
            onActivePresetChange(previewablePresetIds[0]);
        }
    }, [previewablePresetIds, activePresetId, onActivePresetChange]);

    const cyclePreset = useCallback(
        (dir: 1 | -1) => {
            if (previewablePresetIds.length === 0) return;
            const currentIdx = activePresetId
                ? previewablePresetIds.indexOf(activePresetId)
                : 0;
            const nextIdx =
                (currentIdx + dir + previewablePresetIds.length) %
                previewablePresetIds.length;
            onActivePresetChange(previewablePresetIds[nextIdx]);
        },
        [previewablePresetIds, activePresetId, onActivePresetChange],
    );

    const cycleFile = useCallback(
        (dir: 1 | -1) => {
            if (files.length === 0) return;
            const currentIdx = activeFile
                ? files.findIndex((f) => f.id === activeFile.id)
                : 0;
            const nextIdx = (currentIdx + dir + files.length) % files.length;
            onActiveFileChange(files[nextIdx].id);
        },
        [files, activeFile, onActiveFileChange],
    );

    // Footer slot only exists in cover mode (the only mode with a focal point).
    const showFocalPoint = fit === "cover" && !!activePreset && !!activeFile;

    return (
        <WindowPanel
            id="image-studio-crop-preview"
            title="Crop preview"
            onClose={onClose}
            minWidth={520}
            minHeight={420}
            width={720}
            height={560}
            position="bottom-right"
            bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
            actionsRight={
                <CropPreviewSelectors
                    files={files}
                    activeFile={activeFile}
                    onActiveFileChange={onActiveFileChange}
                    cycleFile={cycleFile}
                    previewablePresetIds={previewablePresetIds}
                    activePreset={activePreset}
                    onActivePresetChange={onActivePresetChange}
                    cyclePreset={cyclePreset}
                    previewingAll={previewingAll}
                />
            }
            footer={
                showFocalPoint ? (
                    // The footer slot forces `[&_button]:h-5`; pin the picker's
                    // 16px-square grid cells back to `h-4 w-4` so they don't
                    // stretch into rectangles. `select-text` undoes the footer's
                    // `select-none`.
                    <div className="flex items-center gap-3 select-text [&_.grid_button]:!h-4 [&_.grid_button]:!w-4">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                            Focal point
                        </p>
                        <MiniFocalPointPicker
                            position={position}
                            onChange={onPositionChange}
                        />
                    </div>
                ) : undefined
            }
        >
            {/* Preview body — content only */}
            <div className="flex-1 min-h-0 bg-background">
                {activePreset ? (
                    <CropPreview
                        sourceUrl={activeFile?.objectUrl ?? null}
                        sourceWidth={activeFile?.width ?? null}
                        sourceHeight={activeFile?.height ?? null}
                        sourceName={activeFile?.originalName}
                        sourceBytes={activeFile?.size}
                        dstWidth={activePreset.width}
                        dstHeight={activePreset.height}
                        presetName={activePreset.name}
                        fit={fit}
                        position={position}
                        backgroundColor={backgroundColor}
                        onPositionChange={onPositionChange}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center text-sm text-muted-foreground p-6">
                        <Eye className="h-6 w-6 mb-2 text-muted-foreground/60" />
                        <p className="font-medium">No preset selected</p>
                        <p className="text-xs mt-1">
                            Pick one from the catalog to see the live crop.
                        </p>
                    </div>
                )}
            </div>
        </WindowPanel>
    );
}

// ─── Header selector chrome ───────────────────────────────────────────────────
// File + preset switchers that live in the WindowPanel `actionsRight` slot, not
// in a hand-rolled bar inside the body.

function CropPreviewSelectors({
    files,
    activeFile,
    onActiveFileChange,
    cycleFile,
    previewablePresetIds,
    activePreset,
    onActivePresetChange,
    cyclePreset,
    previewingAll,
}: {
    files: StudioSourceFile[];
    activeFile: StudioSourceFile | null;
    onActiveFileChange: (fileId: string) => void;
    cycleFile: (dir: 1 | -1) => void;
    previewablePresetIds: string[];
    activePreset: { id: string } | null;
    onActivePresetChange: (presetId: string) => void;
    cyclePreset: (dir: 1 | -1) => void;
    previewingAll: boolean;
}) {
    return (
        <div className="flex items-center gap-2 text-xs">
            <SelectorPill icon={<ImageIcon className="h-3 w-3" />} label="File">
                <IconArrowButton
                    onClick={() => cycleFile(-1)}
                    disabled={files.length <= 1}
                    title="Previous file"
                >
                    <ChevronLeft className="h-3 w-3" />
                </IconArrowButton>
                <select
                    value={activeFile?.id ?? ""}
                    onChange={(e) => onActiveFileChange(e.target.value)}
                    className="bg-transparent font-mono text-xs max-w-[140px] truncate focus:outline-none"
                >
                    {files.map((f) => (
                        <option key={f.id} value={f.id}>
                            {f.filenameBase}
                        </option>
                    ))}
                    {files.length === 0 && <option value="">No files</option>}
                </select>
                <IconArrowButton
                    onClick={() => cycleFile(1)}
                    disabled={files.length <= 1}
                    title="Next file"
                >
                    <ChevronRight className="h-3 w-3" />
                </IconArrowButton>
            </SelectorPill>

            <SelectorPill icon={<Layers className="h-3 w-3" />} label="Preset">
                <IconArrowButton
                    onClick={() => cyclePreset(-1)}
                    disabled={previewablePresetIds.length <= 1}
                    title="Previous preset"
                >
                    <ChevronLeft className="h-3 w-3" />
                </IconArrowButton>
                <select
                    value={activePreset?.id ?? ""}
                    onChange={(e) => onActivePresetChange(e.target.value)}
                    className="bg-transparent text-xs max-w-[180px] truncate focus:outline-none"
                >
                    {previewablePresetIds.map((id) => {
                        const p = getPresetById(id);
                        return (
                            <option key={id} value={id}>
                                {p ? `${p.name} — ${p.width}×${p.height}` : id}
                            </option>
                        );
                    })}
                    {previewablePresetIds.length === 0 && (
                        <option value="">No presets available</option>
                    )}
                </select>
                <IconArrowButton
                    onClick={() => cyclePreset(1)}
                    disabled={previewablePresetIds.length <= 1}
                    title="Next preset"
                >
                    <ChevronRight className="h-3 w-3" />
                </IconArrowButton>
            </SelectorPill>
            {previewingAll && (
                <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-medium">
                    Browsing all presets — pick one in the catalog to lock it in
                </span>
            )}
        </div>
    );
}

// ─── Local primitives ────────────────────────────────────────────────────────

function SelectorPill({
    icon,
    label,
    children,
}: {
    icon: React.ReactNode;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5">
            <span className="text-muted-foreground flex items-center gap-1 px-1 text-[10px] uppercase tracking-wider font-semibold">
                {icon}
                {label}
            </span>
            <span className="w-px h-4 bg-border" />
            {children}
        </div>
    );
}

function IconArrowButton({
    children,
    onClick,
    disabled,
    title,
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    title?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={cn(
                "h-5 w-5 rounded hover:bg-accent flex items-center justify-center text-muted-foreground",
                "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent",
            )}
        >
            {children}
        </button>
    );
}
