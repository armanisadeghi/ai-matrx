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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CollapsibleTextProps {
  children: ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  collapsedLines?: number;
  className?: string;
  expandLabel?: string;
  collapseLabel?: string;
  /**
   * Show the label as visible text on the toggle ("Show more" / "Show less"),
   * as comment threads do (Linear, Notion). Default: icon-only, labelled for
   * assistive tech.
   */
  showLabel?: boolean;
}

export function CollapsibleText({
  children,
  expanded,
  onExpandedChange,
  collapsedLines = 4,
  className,
  expandLabel = "Expand text",
  collapseLabel = "Collapse text",
  showLabel = false,
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

  if (showLabel) {
    return (
      <div className="relative min-w-0">
        <div
          ref={contentRef}
          className={cn(
            "overflow-hidden whitespace-pre-wrap break-words",
            isCollapsed &&
              "[mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]",
            className,
          )}
          style={isCollapsed && collapsedHeight > 0 ? { maxHeight: `${collapsedHeight}px` } : undefined}
        >
          {children}
        </div>
        {isOverflowing ? (
          <button
            type="button"
            aria-expanded={!isCollapsed}
            onClick={(event) => {
              event.stopPropagation();
              onExpandedChange(isCollapsed);
            }}
            className="mt-0.5 inline-flex min-h-6 items-center gap-0.5 rounded text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronUp className="h-3.5 w-3.5" aria-hidden />}
            {isCollapsed ? expandLabel : collapseLabel}
          </button>
        ) : null}
      </div>
    );
  }

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
            icon={<ChevronDown />}
            type="button"
            variant="outline"
            aria-label={expandLabel}
            aria-expanded={false}
            onClick={(event) => {
              event.stopPropagation();
              onExpandedChange(true);
            }}
            className="pointer-events-auto"
          />
        </div>
      ) : isOverflowing ? (
        <div className="flex justify-center pt-0.5">
          <Button
            icon={<ChevronUp />}
            type="button"
            variant="quiet"
            aria-label={collapseLabel}
            aria-expanded
            onClick={(event) => {
              event.stopPropagation();
              onExpandedChange(false);
            }}
          />
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
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            icon={<ChevronsDown className="!size-[18px] lg:!size-3.5" />}
            type="button"
            variant="quiet"
            aria-label="Expand all"
            onClick={onExpandAll}
            disabled={disabled || allExpanded}
          />
        </TooltipTrigger>
        <TooltipContent side="top">Expand all</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            icon={<ChevronsUp className="!size-[18px] lg:!size-3.5" />}
            type="button"
            variant="quiet"
            aria-label="Collapse all"
            onClick={onCollapseAll}
            disabled={disabled || !anyExpanded}
          />
        </TooltipTrigger>
        <TooltipContent side="top">Collapse all</TooltipContent>
      </Tooltip>
    </div>
  );
}
