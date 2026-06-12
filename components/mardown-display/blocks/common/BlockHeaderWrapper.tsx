"use client";
import React, { useState, useRef, useEffect, ReactNode } from "react";
import {
    Maximize2, Minimize2, ExternalLink, Upload, Download, LucideIcon, MoreHorizontal
} from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import IconButton from "@/components/official/IconButton";
import AdvancedMenu, { MenuItem } from "@/components/official/AdvancedMenu";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CanvasContentType } from "@/features/canvas/redux/canvasSlice";

export interface BlockHeaderWrapperProps {
    // Header left side
    icon: LucideIcon;
    iconClassName?: string;
    title: string;
    description?: string;

    // Bottom toolbar (progress, filters, reset, etc.) — rendered inside the gradient card
    controls?: ReactNode;

    // Main content
    children: ReactNode;

    // Canvas integration
    canvasType?: CanvasContentType;
    canvasData?: unknown;
    canvasMetadata?: Record<string, unknown>;
    taskId?: string;

    /**
     * The exact data object to export as JSON.
     * When provided, a Download button (desktop) / menu item (mobile) appears.
     */
    exportData?: unknown;
    /** Filename without extension. Defaults to "export". */
    exportFilename?: string;

    /**
     * Called with the parsed JSON object when the user picks a valid JSON file.
     * The block is responsible for validating/applying the new data.
     */
    onDataImport?: (data: unknown) => void;

    /**
     * Extra buttons rendered on desktop alongside the standard action buttons.
     * On mobile these are hidden — use extraMenuItems to expose them in the menu.
     */
    extraActions?: ReactNode;

    /**
     * Extra items injected into the mobile AdvancedMenu (and ignored on desktop,
     * where extraActions handles the same actions visually).
     */
    extraMenuItems?: MenuItem[];

    // Styling
    /** Tailwind gradient classes for the header card background */
    headerGradient?: string;
    /** Tailwind border class for the header card */
    headerBorder?: string;
    /** Classes applied to the import/export/fullscreen buttons */
    actionButtonClassName?: string;
    /** Classes applied to the canvas button */
    canvasButtonClassName?: string;
}

/**
 * BlockHeaderWrapper
 *
 * Reusable gradient header wrapper for chat markdown blocks.
 *
 * Desktop: individual icon buttons (Upload, Download, extra actions, Canvas, Fullscreen).
 * Mobile:  a single MoreHorizontal trigger that opens an AdvancedMenu with all actions.
 */
const BlockHeaderWrapper: React.FC<BlockHeaderWrapperProps> = ({
    icon: Icon,
    iconClassName = "bg-blue-500 dark:bg-blue-600",
    title,
    description,
    controls,
    children,
    canvasType,
    canvasData,
    canvasMetadata,
    taskId,
    exportData,
    exportFilename = "export",
    onDataImport,
    extraActions,
    extraMenuItems = [],
    headerGradient = "bg-gradient-to-br from-blue-100 via-indigo-50 to-purple-100 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-purple-950/40",
    headerBorder = "border-blue-200 dark:border-blue-800/50",
    actionButtonClassName = "bg-primary text-primary-foreground shadow-sm hover:bg-primary/80 hover:shadow-md transform hover:scale-105 transition-all",
    canvasButtonClassName = "bg-secondary text-primary-foreground shadow-sm hover:bg-secondary/80 hover:shadow-md transform hover:scale-105 transition-all",
}) => {
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [descriptionExpanded, setDescriptionExpanded] = useState(false);
    const menuAnchorRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isMobile = useIsMobile();
    const { open: openCanvas } = useCanvas();

    // Close fullscreen on ESC (desktop & mobile)
    useEffect(() => {
        if (!isFullScreen) return;
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsFullScreen(false);
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [isFullScreen]);

    // ── Canvas ────────────────────────────────────────────────────────────────
    const handleCanvasOpen = () => {
        if (!canvasType || !canvasData) return;
        openCanvas({
            type: canvasType,
            data: canvasData,
            metadata: { ...canvasMetadata, sourceTaskId: taskId },
        });
    };

    // ── Export ────────────────────────────────────────────────────────────────
    const handleExport = () => {
        if (exportData === undefined) return;
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${exportFilename}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Import ────────────────────────────────────────────────────────────────
    const handleImportClick = () => fileInputRef.current?.click();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onDataImport) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                onDataImport(JSON.parse(event.target?.result as string));
            } catch {
                console.error("BlockHeaderWrapper: failed to parse imported JSON file");
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    // ── Mobile menu items ─────────────────────────────────────────────────────
    const mobileMenuItems: MenuItem[] = [];

    if (onDataImport) {
        mobileMenuItems.push({
            key: "import",
            icon: Upload,
            iconColor: "text-primary",
            label: "Import from JSON",
            action: handleImportClick,
            showToast: false,
        });
    }

    if (exportData !== undefined) {
        mobileMenuItems.push({
            key: "export",
            icon: Download,
            iconColor: "text-primary",
            label: "Save as JSON",
            action: handleExport,
            showToast: false,
        });
    }

    // Inject caller-supplied items (e.g. block-specific actions like task import)
    mobileMenuItems.push(...extraMenuItems);

    if (!isFullScreen && canvasType && canvasData) {
        mobileMenuItems.push({
            key: "canvas",
            icon: ExternalLink,
            iconColor: "text-secondary",
            label: "Open Canvas",
            action: handleCanvasOpen,
            showToast: false,
        });
    }

    // NOTE: fullscreen toggle is always visible on mobile (not in the menu)

    const showCanvas = !isFullScreen && canvasType && canvasData;

    return (
        <>
            {/* Hidden file input for import */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
            />

            {/* Fullscreen: single backdrop + centering layer — click outside the panel to close */}
            <div
                className={`w-full ${
                    isFullScreen
                        ? "fixed inset-0 z-50 flex items-center justify-center p-2 matrx-glass-thin-border cursor-pointer"
                        : "py-3"
                }`}
                onClick={isFullScreen ? () => setIsFullScreen(false) : undefined}
            >
                <div
                    className={`max-w-6xl mx-auto ${
                        isFullScreen
                            ? "bg-textured rounded-xl shadow-2xl h-full max-h-[98dvh] w-full flex flex-col overflow-hidden border border-primary cursor-default"
                            : ""
                    }`}
                    onClick={isFullScreen ? (e) => e.stopPropagation() : undefined}
                >
                    {/* Scrollable content */}
                    <div className={isFullScreen ? "flex-1 overflow-y-auto" : ""}>
                        <div className="p-2 space-y-4">

                            {/* Gradient header card */}
                            <div className={`${headerGradient} rounded-xl p-2 shadow-md border ${headerBorder}`}>

                                {/* Top row: icon + title/description | action buttons */}
                                <div className="flex items-start justify-between gap-3 mb-3">

                                    {/* Left: icon + text */}
                                    <div className="flex items-start gap-2 flex-1">
                                        <div className={`p-2 ${iconClassName} rounded-lg shadow-sm flex-shrink-0`}>
                                            <Icon className="h-5 w-5 text-primary-foreground" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h1 className="text-sm font-bold text-primary-foreground leading-tight">
                                                {title}
                                            </h1>
                                            {description && (
                                                <button
                                                    type="button"
                                                    onClick={() => setDescriptionExpanded((prev) => !prev)}
                                                    aria-expanded={descriptionExpanded}
                                                    aria-label={descriptionExpanded ? "Collapse description" : "Expand description"}
                                                    className="text-left text-xs text-muted-foreground mt-1 w-full group flex items-start gap-1.5 cursor-pointer hover:text-foreground/80 transition-colors"
                                                >
                                                    <span
                                                        className={`flex-1 min-w-0 ${
                                                            descriptionExpanded ? "leading-relaxed" : "line-clamp-1"
                                                        }`}
                                                    >
                                                        {description}
                                                    </span>
                                                    <span className="flex-shrink-0 mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                                                    </span>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: action buttons */}
                                    <div className="flex items-center gap-2 flex-shrink-0">

                                        {/* ── Desktop buttons ───────────────────────────── */}
                                        {!isMobile && (
                                            <>
                                                {onDataImport && (
                                                    <IconButton
                                                        icon={Upload}
                                                        tooltip="Import from JSON file"
                                                        onClick={handleImportClick}
                                                        size="sm"
                                                        className={actionButtonClassName}
                                                    />
                                                )}
                                                {exportData !== undefined && (
                                                    <IconButton
                                                        icon={Download}
                                                        tooltip="Save as JSON file"
                                                        onClick={handleExport}
                                                        size="sm"
                                                        className={actionButtonClassName}
                                                    />
                                                )}
                                                {extraActions}
                                                {showCanvas && (
                                                    <IconButton
                                                        icon={ExternalLink}
                                                        tooltip="Open Canvas"
                                                        onClick={handleCanvasOpen}
                                                        size="sm"
                                                        className={canvasButtonClassName}
                                                    />
                                                )}
                                                {!isFullScreen ? (
                                                    <IconButton
                                                        icon={Maximize2}
                                                        tooltip="Expand to full screen"
                                                        onClick={() => setIsFullScreen(true)}
                                                        size="sm"
                                                        className={actionButtonClassName}
                                                    />
                                                ) : (
                                                    <IconButton
                                                        icon={Minimize2}
                                                        tooltip="Exit full screen"
                                                        onClick={() => setIsFullScreen(false)}
                                                        size="sm"
                                                        className={actionButtonClassName}
                                                    />
                                                )}
                                            </>
                                        )}

                                        {/* ── Mobile: always-visible fullscreen toggle + ... menu ── */}
                                        {isMobile && (
                                            <>
                                                {/* Fullscreen toggle — always visible */}
                                                {isFullScreen ? (
                                                    <IconButton
                                                        icon={Minimize2}
                                                        tooltip="Exit full screen"
                                                        onClick={() => setIsFullScreen(false)}
                                                        size="sm"
                                                        className={actionButtonClassName}
                                                    />
                                                ) : (
                                                    <IconButton
                                                        icon={Maximize2}
                                                        tooltip="Full screen"
                                                        onClick={() => setIsFullScreen(true)}
                                                        size="sm"
                                                        className={actionButtonClassName}
                                                    />
                                                )}

                                                {/* ... menu — always shown when there are items (fullscreen or not) */}
                                                {mobileMenuItems.length > 0 && (
                                                    <div ref={menuAnchorRef} className="contents">
                                                        <IconButton
                                                            icon={MoreHorizontal}
                                                            tooltip="More options"
                                                            onClick={() => setMenuOpen((prev) => !prev)}
                                                            size="sm"
                                                            className={actionButtonClassName}
                                                        />
                                                    </div>
                                                )}

                                                <AdvancedMenu
                                                    isOpen={menuOpen}
                                                    onClose={() => setMenuOpen(false)}
                                                    items={mobileMenuItems}
                                                    title="Options"
                                                    position="bottom-right"
                                                    anchorElement={menuAnchorRef.current}
                                                    categorizeItems={false}
                                                />
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Bottom row: progress, filters, etc. */}
                                {controls && <div>{controls}</div>}
                            </div>

                            {/* Block-specific content */}
                            {children}

                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default BlockHeaderWrapper;
