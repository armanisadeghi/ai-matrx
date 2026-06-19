"use client";

import dynamic from "next/dynamic";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MatrxDynamicPanel = dynamic(
  () => import("@/components/matrx/resizable/MatrxDynamicPanel"),
  { ssr: false },
);

type PanelPosition = "left" | "right" | "top" | "bottom";

export interface MatrxDynamicPanelHostProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  position?: PanelPosition;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  /** Blocks Escape, collapse, and the header close button while true. */
  dismissDisabled?: boolean;
  className?: string;
  expandButtonLabel?: string;
  /** Rendered between the title block and the close button (e.g. toolbar actions). */
  headerActions?: ReactNode;
  /** Wrapper around panel body. Default adds horizontal padding. */
  contentClassName?: string;
}

export function MatrxDynamicPanelHost({
  open,
  onOpenChange,
  title,
  description,
  children,
  position = "right",
  defaultSize = 38,
  minSize = 22,
  maxSize = 88,
  dismissDisabled = false,
  className,
  expandButtonLabel,
  headerActions,
  contentClassName = "px-3 pb-4",
}: MatrxDynamicPanelHostProps) {
  useEffect(() => {
    if (!open || dismissDisabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, dismissDisabled, onOpenChange]);

  if (!open) return null;

  const requestClose = () => {
    if (!dismissDisabled) onOpenChange(false);
  };

  const collapsedLabel =
    expandButtonLabel ?? (typeof title === "string" ? title : "Panel");

  return (
    <MatrxDynamicPanel
      initialPosition={position}
      isExpanded
      defaultExpanded
      onExpandedChange={(expanded) => {
        if (!expanded && !dismissDisabled) onOpenChange(false);
      }}
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={maxSize}
      className={cn(className)}
      expandButtonProps={{ label: collapsedLabel }}
      header={
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-foreground">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {headerActions}
        </div>
      }
    >
      <div className={cn(contentClassName)}>{children}</div>
    </MatrxDynamicPanel>
  );
}

/** Map a pixel width target to a viewport percentage for MatrxDynamicPanel sizing. */
export function sidePanelWidthToPercent(
  px: number,
  viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1440,
  minPct = 22,
  maxPct = 88,
): number {
  const pct = Math.round((px / Math.max(viewportWidth, 1)) * 100);
  return Math.min(maxPct, Math.max(minPct, pct));
}
