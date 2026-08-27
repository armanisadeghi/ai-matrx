/**
 * CollapsibleText — measured multiline text with a compact preview and fade.
 *
 * Use for user-authored text that can become long inside dense lists, timelines,
 * and cards. The caller owns expansion state so individual toggles and
 * expand-all/collapse-all controls stay in sync.
 *
 * @official-component
 */

"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsDown, ChevronsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CollapsibleTextProps {
  children: ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  collapsedLines?: number;
  className?: string;
  expandLabel?: string;
  collapseLabel?: string;
}

export function CollapsibleText({
  children,
  expanded,
  onExpandedChange,
  collapsedLines = 4,
  className,
  expandLabel = "Expand text",
  collapseLabel = "Collapse text",
}: CollapsibleTextProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [collapsedHeight, setCollapsedHeight] = useState(0);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return undefined;

    const measure = () => {
      const styles = window.getComputedStyle(node);
      const parsedLineHeight = Number.parseFloat(styles.lineHeight);
      const parsedFontSize = Number.parseFloat(styles.fontSize);
      const lineHeight = Number.isFinite(parsedLineHeight)
        ? parsedLineHeight
        : parsedFontSize * 1.4;
      const nextCollapsedHeight = Math.ceil(lineHeight * collapsedLines);
      setCollapsedHeight(nextCollapsedHeight);
      setIsOverflowing(node.scrollHeight > nextCollapsedHeight + 1);
    };

    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [children, collapsedLines]);

  const isCollapsed = isOverflowing && !expanded;

  return (
    <div className="relative min-w-0">
      <div
        ref={contentRef}
        className={cn(
          "overflow-hidden whitespace-pre-wrap break-words transition-[max-height] duration-300 ease-out",
          isCollapsed &&
            "[mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]",
          className,
        )}
        style={
          isCollapsed && collapsedHeight > 0
            ? { maxHeight: `${collapsedHeight}px` }
            : undefined
        }
      >
        {children}
      </div>

      {isCollapsed ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={expandLabel}
            aria-expanded={false}
            onClick={(event) => {
              event.stopPropagation();
              onExpandedChange(true);
            }}
            className="pointer-events-auto h-11 w-11 rounded-full bg-card/90 shadow-sm backdrop-blur-sm sm:h-6 sm:w-6"
          >
            <ChevronDown className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Button>
        </div>
      ) : isOverflowing ? (
        <div className="flex justify-center pt-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={collapseLabel}
            aria-expanded
            onClick={(event) => {
              event.stopPropagation();
              onExpandedChange(false);
            }}
            className="h-11 w-11 rounded-full text-muted-foreground sm:h-6 sm:w-6"
          >
            <ChevronUp className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface CollapsibleTextGroupControlsProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  allExpanded: boolean;
  anyExpanded: boolean;
  disabled?: boolean;
}

export function CollapsibleTextGroupControls({
  onExpandAll,
  onCollapseAll,
  allExpanded,
  anyExpanded,
  disabled = false,
}: CollapsibleTextGroupControlsProps) {
  return (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onExpandAll}
        disabled={disabled || allExpanded}
        className="h-11 gap-1 px-1.5 text-[11px] sm:h-7"
      >
        <ChevronsDown className="h-3.5 w-3.5" />
        Expand all
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCollapseAll}
        disabled={disabled || !anyExpanded}
        className="h-11 gap-1 px-1.5 text-[11px] sm:h-7"
      >
        <ChevronsUp className="h-3.5 w-3.5" />
        Collapse all
      </Button>
    </div>
  );
}
