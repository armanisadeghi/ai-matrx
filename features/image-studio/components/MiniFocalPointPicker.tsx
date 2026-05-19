"use client";

import React from "react";
import { Scan, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImagePosition, ImagePositionAnchor } from "../types";

interface MiniFocalPointPickerProps {
    position: ImagePosition;
    onChange: (p: ImagePosition) => void;
}

const GRID: ImagePositionAnchor[] = [
    "top-left",
    "top",
    "top-right",
    "left",
    "center",
    "right",
    "bottom-left",
    "bottom",
    "bottom-right",
];

/**
 * Compact focal-point picker for use inside the crop preview window.
 * Shares behavior with `CropControls` but renders in a single flex row.
 */
export function MiniFocalPointPicker({
    position,
    onChange,
}: MiniFocalPointPickerProps) {
    return (
        <div className="flex items-center gap-2">
            <div className="grid grid-cols-3 grid-rows-3 gap-[2px] rounded-md border border-border bg-muted/40 p-[3px]">
                {GRID.map((pos) => {
                    const active = typeof position === "string" && position === pos;
                    return (
                        <button
                            key={pos}
                            type="button"
                            onClick={() => onChange(pos)}
                            title={pos.replace("-", " ")}
                            className={cn(
                                "h-4 w-4 rounded-sm transition-colors flex items-center justify-center",
                                active
                                    ? "bg-primary shadow-sm"
                                    : "bg-background hover:bg-muted",
                            )}
                        >
                            <span
                                className={cn(
                                    "h-1 w-1 rounded-full",
                                    active ? "bg-primary-foreground" : "bg-muted-foreground/50",
                                )}
                            />
                        </button>
                    );
                })}
            </div>

            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => onChange("attention")}
                    title="Smart — Attention"
                    className={cn(
                        "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                        typeof position === "string" && position === "attention"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-muted/40 text-muted-foreground",
                    )}
                >
                    <Zap className="h-2.5 w-2.5" />
                    Sm·A
                </button>
                <button
                    type="button"
                    onClick={() => onChange("entropy")}
                    title="Smart — Entropy"
                    className={cn(
                        "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                        typeof position === "string" && position === "entropy"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-muted/40 text-muted-foreground",
                    )}
                >
                    <Scan className="h-2.5 w-2.5" />
                    Sm·E
                </button>
            </div>
        </div>
    );
}
