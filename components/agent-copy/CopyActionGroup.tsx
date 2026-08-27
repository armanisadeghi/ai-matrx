"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * CopyActionGroup — the even-width Copy + Copy-for-AI + Export action row.
 * Touch layouts keep the full 44px hit areas but drop the heavy shared frame;
 * desktop restores the compact segmented chrome. Cells are wide enough for
 * the AI chevron so that segment is never the odd one.
 *
 * Children must each render a single in-flow root (dialogs portal). Pass the
 * matching {@link copyActionSegmentClass} to every trigger so hover/focus
 * land on the cell, not a floating ghost button.
 */
export type CopyActionSize = "xs" | "icon" | "sm";
export type CopyActionAppearance = "segmented" | "bare";

const GROUP_SIZE: Record<CopyActionSize, string> = {
  xs: "h-11 lg:h-5",
  icon: "h-11 lg:h-7",
  sm: "h-11 lg:h-8",
};

const CELL_SIZE: Record<CopyActionSize, string> = {
  xs: "w-11 lg:w-8",
  icon: "w-11 lg:w-10",
  sm: "w-11 lg:w-10",
};

export function CopyActionGroup({
  size = "icon",
  appearance = "segmented",
  className,
  children,
}: {
  size?: CopyActionSize;
  appearance?: CopyActionAppearance;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      data-copy-action-group=""
      data-copy-action-appearance={appearance}
      className={cn(
        "inline-flex w-max min-w-max max-w-none shrink-0 items-stretch overflow-visible rounded-none border-0 bg-transparent",
        "divide-x-0 shadow-none",
        appearance === "segmented" &&
          "lg:overflow-hidden lg:rounded-md lg:border lg:border-border lg:bg-background lg:divide-x lg:divide-border",
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
  return cn(
    "inline-flex h-full shrink-0 items-stretch justify-center",
    CELL_SIZE[size],
  );
}

/** Trigger that fills its cell — no individual chrome, no scale-on-press. */
export function copyActionSegmentClass(
  size: CopyActionSize = "icon",
  appearance: CopyActionAppearance = "segmented",
): string {
  return cn(
    "h-full w-full rounded-md bg-transparent shadow-none active:scale-100",
    appearance === "segmented"
      ? "text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent active:text-accent-foreground lg:rounded-none"
      : "text-muted-foreground hover:bg-transparent hover:text-foreground focus:bg-transparent focus-visible:bg-transparent focus-visible:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 active:bg-transparent active:text-foreground data-[state=open]:bg-transparent",
    size === "xs"
      ? "[&_svg]:size-[18px] lg:[&_svg]:size-3"
      : "[&_svg]:size-[18px] lg:[&_svg]:size-3.5",
  );
}
