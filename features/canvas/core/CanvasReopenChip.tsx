"use client";

/**
 * CanvasReopenChip — a small, beautiful, persistent affordance that lets
 * the user re-open the canvas after they've closed it (without losing the
 * items they generated). Renders only when:
 *   1. There is at least one canvas item in the current session, AND
 *   2. The canvas is currently closed.
 *
 * Positioned bottom-right, above the page content but below the canvas
 * itself, mobile-safe (uses pb-safe inset to avoid the home indicator).
 *
 * Visual language matches the chat input pill — rounded-full, soft border,
 * subtle shadow, with a glass tap button feel on hover.
 */

import React from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectCanvasIsOpen,
  selectCanvasItems,
  selectCurrentItemId,
  setCurrentItem,
  type CanvasItem,
} from "@/features/canvas/redux/canvasSlice";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export function CanvasReopenChip() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectCanvasIsOpen);
  const items = useAppSelector(selectCanvasItems);
  const currentItemId = useAppSelector(selectCurrentItemId);

  if (isOpen) return null;
  if (items.length === 0) return null;

  // Most-recent first so the chip's label is meaningful.
  const sorted: CanvasItem[] = [...items].sort(
    (a, b) => b.timestamp - a.timestamp,
  );
  const headline = sorted[0];
  const reopenId = currentItemId ?? headline.id;

  const headlineTitle =
    typeof headline.content.metadata?.title === "string"
      ? headline.content.metadata.title
      : "Canvas";

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-[9990]",
        // Mobile safe-area: lift above the home indicator on iOS without
        // hardcoding pixel values. Combined with bottom-4 so the chip
        // floats nicely on tablets too.
        "pb-safe",
      )}
    >
      <button
        type="button"
        onClick={() => dispatch(setCurrentItem(reopenId))}
        className={cn(
          "group inline-flex h-10 items-center gap-2 rounded-full pl-3 pr-4",
          "bg-card text-card-foreground",
          "border border-border/80",
          "shadow-[0_2px_16px_-4px_rgba(0,0,0,0.18)]",
          "dark:shadow-[0_2px_16px_-4px_rgba(0,0,0,0.6)]",
          "transition-all duration-150",
          "hover:bg-accent hover:border-border",
          "active:translate-y-px active:shadow-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        )}
        aria-label={`Reopen canvas — ${items.length} item${items.length === 1 ? "" : "s"}`}
        title="Reopen canvas (⌘\\)"
      >
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full",
            "bg-primary/10 text-primary",
            "transition-colors group-hover:bg-primary/15",
          )}
        >
          <Layers className="h-3.5 w-3.5" />
        </span>
        <span className="flex flex-col items-start leading-none">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
            Canvas
          </span>
          <span className="mt-0.5 max-w-[180px] truncate text-xs font-medium text-foreground">
            {headlineTitle}
          </span>
        </span>
        {items.length > 1 && (
          <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
            {items.length}
          </span>
        )}
      </button>
    </div>
  );
}
