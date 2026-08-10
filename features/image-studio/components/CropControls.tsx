"use client";

/**
 * CropControls — fit-mode + focal-point picker for the studio.
 *
 * Layout:
 *   1. Three fit-mode buttons: Cover | Contain | Inside
 *   2. When "Cover" is active → 3×3 focal-point grid + "Smart" row
 *   3. A live explainer beneath both so the user knows what will happen
 *
 * Used globally from ExportPanel. Later can be reused per-file for overrides.
 */

import React from "react";
import {
    Aperture,
    Crop,
    Maximize2,
    Scan,
    Scaling,
    Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImageFit, ImagePosition, ImagePositionAnchor } from "../types";
import {
    CROPPING_IMAGE_FIT,
    IMAGE_FIT_OPTIONS,
    POSITION_ANCHOR_GRID,
    SMART_POSITION_OPTIONS,
} from "../constants/conversion-options";

interface CropControlsProps {
    fit: ImageFit;
    position: ImagePosition;
    onFitChange: (fit: ImageFit) => void;
    onPositionChange: (position: ImagePosition) => void;
}

/**
 * The vocabulary (ids, labels, blurbs) lives in
 * `constants/conversion-options` — the ONE module the agent write handler
 * validates against and the surface manifest quotes its enums from. Only the
 * icons are local, mapped by id, because that module stays JSX-free.
 */
const FIT_ICONS: Record<ImageFit, React.ReactNode> = {
    cover: <Crop className="h-3.5 w-3.5" />,
    contain: <Maximize2 className="h-3.5 w-3.5" />,
    inside: <Scaling className="h-3.5 w-3.5" />,
};

const SMART_ICONS: Partial<Record<ImagePositionAnchor, React.ReactNode>> = {
    attention: <Flame className="h-3 w-3" />,
    entropy: <Scan className="h-3 w-3" />,
};

const FIT_OPTIONS = IMAGE_FIT_OPTIONS;
const POSITION_GRID = POSITION_ANCHOR_GRID;
const SMART_OPTIONS = SMART_POSITION_OPTIONS;

export function CropControls({
    fit,
    position,
    onFitChange,
    onPositionChange,
}: CropControlsProps) {
    const activeFit = FIT_OPTIONS.find((f) => f.id === fit);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Aperture className="h-3 w-3" />
                    Crop & fit
                </label>
            </div>

            {/* Fit mode */}
            <div className="grid grid-cols-3 gap-1.5">
                {FIT_OPTIONS.map((opt) => (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => onFitChange(opt.id)}
                        title={opt.blurb}
                        className={cn(
                            "flex flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 text-[11px] font-medium transition-colors",
                            fit === opt.id
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-background hover:bg-muted/40",
                        )}
                    >
                        {FIT_ICONS[opt.id]}
                        {opt.label}
                    </button>
                ))}
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
                {activeFit?.blurb}
            </p>

            {/* Position picker — only when the fit mode actually crops */}
            {fit === CROPPING_IMAGE_FIT && (
                <div className="space-y-2 pt-1 border-t border-border">
                    <label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                        Focal point
                    </label>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                        Which part of the image should stay anchored when the preset
                        aspect ratio forces a crop?
                    </p>

                    {/* 3×3 grid */}
                    <div className="inline-flex flex-col gap-1 rounded-lg border border-border bg-muted/20 p-2">
                        <div className="grid grid-cols-3 gap-1">
                            {POSITION_GRID.map((p) => {
                                const active =
                                    typeof position === "string" && position === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => onPositionChange(p.id)}
                                        title={p.label}
                                        className={cn(
                                            "h-7 w-7 rounded-md border transition-all flex items-center justify-center",
                                            active
                                                ? "border-primary bg-primary shadow-sm"
                                                : "border-border bg-background hover:bg-muted",
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "h-1.5 w-1.5 rounded-full",
                                                active
                                                    ? "bg-primary-foreground"
                                                    : "bg-muted-foreground/60",
                                            )}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[10px] font-medium text-center tabular-nums">
                            {typeof position === "object"
                                ? `Custom · ${(position.x * 100).toFixed(0)}%, ${(position.y * 100).toFixed(0)}%`
                                : (POSITION_GRID.find((p) => p.id === position)?.label ??
                                  (position === "attention"
                                      ? "Smart — Attention"
                                      : position === "entropy"
                                        ? "Smart — Entropy"
                                        : ""))}
                        </p>
                    </div>

                    {typeof position === "object" && (
                        <p className="text-[11px] text-muted-foreground leading-snug rounded-md bg-primary/5 border border-primary/30 px-2 py-1.5">
                            Custom focal point set by drag. Click any anchor above to snap
                            back, or open the live preview to drag to a new spot.
                        </p>
                    )}

                    {/* Smart crop options */}
                    <div>
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                            Or let Sharp decide
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                            {SMART_OPTIONS.map((opt) => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => onPositionChange(opt.id)}
                                    title={opt.blurb}
                                    className={cn(
                                        "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors",
                                        typeof position === "string" &&
                                            position === opt.id
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border bg-background hover:bg-muted/40",
                                    )}
                                >
                                    {SMART_ICONS[opt.id]}
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {(fit === "contain" || fit === "inside") && (
                <p className="text-[11px] text-muted-foreground leading-snug rounded-md bg-muted/30 border border-border px-2 py-1.5">
                    {fit === "contain"
                        ? "Padding is filled with the transparent-fill colour above."
                        : "Smaller output means no cropping, no padding — useful for previews."}
                </p>
            )}
        </div>
    );
}
