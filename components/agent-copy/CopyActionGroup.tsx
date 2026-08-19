"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * CopyActionGroup — the even-width segmented chrome for Copy + Copy-for-AI
 * + Export. One shared border, one height, one cell width per action. Cells
 * are wide enough for the AI chevron so that segment is never the odd one.
 *
 * Children must each render a single in-flow root (dialogs portal). Pass the
 * matching {@link copyActionSegmentClass} to every trigger so hover/focus
 * land on the cell, not a floating ghost button.
 */
export type CopyActionSize = "xs" | "icon" | "sm";

const GROUP_SIZE: Record<CopyActionSize, string> = {
  xs: "h-11 lg:h-6",
  icon: "h-11 lg:h-8",
  sm: "h-11 lg:h-8",
};

const CELL_SIZE: Record<CopyActionSize, string> = {
  xs: "w-11 lg:w-8",
  icon: "w-11 lg:w-10",
  sm: "w-11 lg:w-10",
};

export function CopyActionGroup({
  size = "icon",
  className,
  children,
}: {
  size?: CopyActionSize;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      data-copy-action-group=""
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-md border border-border bg-background",
        "divide-x divide-border shadow-none",
        GROUP_SIZE[size],
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Even-width cell that fills one group slot. Put this on the child's root. */
export function copyActionCellClass(size: CopyActionSize = "icon"): string {
  return cn("inline-flex h-full items-stretch justify-center", CELL_SIZE[size]);
}

/** Trigger that fills its cell — no individual chrome, no scale-on-press. */
export function copyActionSegmentClass(size: CopyActionSize = "icon"): string {
  return cn(
    "h-full w-full rounded-none shadow-none active:scale-100",
    "hover:bg-accent hover:text-accent-foreground",
    size === "xs" ? "[&_svg]:size-3" : "[&_svg]:size-3.5",
  );
}
