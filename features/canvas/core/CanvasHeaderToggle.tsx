"use client";

/**
 * Canvas open/close control anchored next to the user avatar — same slot when
 * the canvas is closed (shell header) or open (canvas pane header). Replaces
 * the bottom-right CanvasReopenChip pill.
 */

import { useCallback, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  closeCanvas,
  selectCanvasIsAvailable,
  selectCanvasIsOpen,
  selectCanvasItems,
  selectCurrentItemId,
  setCurrentItem,
} from "@/features/canvas/redux/canvasSlice";
import {
  LayersTapButton,
  PanelRightTapButton,
} from "@/components/icons/tap-buttons";
import { cn } from "@/lib/utils";

function useCanvasHeaderToggle() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectCanvasIsOpen);
  const isAvailable = useAppSelector(selectCanvasIsAvailable);
  const items = useAppSelector(selectCanvasItems);
  const currentItemId = useAppSelector(selectCurrentItemId);

  const headlineTitle = useMemo(() => {
    if (items.length === 0) return "Canvas";
    const sorted = [...items].sort((a, b) => b.timestamp - a.timestamp);
    const title = sorted[0]?.content.metadata?.title;
    return typeof title === "string" ? title : "Canvas";
  }, [items]);

  const reopen = useCallback(() => {
    if (items.length === 0) return;
    const sorted = [...items].sort((a, b) => b.timestamp - a.timestamp);
    const reopenId = currentItemId ?? sorted[0]!.id;
    dispatch(setCurrentItem(reopenId));
  }, [dispatch, items, currentItemId]);

  const putAway = useCallback(() => {
    dispatch(closeCanvas());
  }, [dispatch]);

  return {
    isOpen,
    isAvailable,
    itemCount: items.length,
    headlineTitle,
    reopen,
    putAway,
  };
}

/** Shell header — show when canvas has items but is closed. Sits left of avatar. */
export function CanvasShellHeaderToggle() {
  const { isOpen, isAvailable, itemCount, headlineTitle, reopen } =
    useCanvasHeaderToggle();

  if (isOpen || !isAvailable || itemCount === 0) return null;

  return (
    <div className="relative shrink-0">
      <LayersTapButton
        onClick={reopen}
        ariaLabel={`Open canvas — ${headlineTitle}`}
        tooltip={`Open canvas — ${headlineTitle} (⌘\\)`}
        className={cn("text-primary", "hover:bg-primary/10")}
      />
      {itemCount > 1 && (
        <span
          className="pointer-events-none absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground"
          aria-hidden
        >
          {itemCount}
        </span>
      )}
    </div>
  );
}

/** Canvas pane header — put away (panel slides right). Sits left of avatar. */
export function CanvasPanePutAwayToggle({
  onPutAway,
}: {
  onPutAway: () => void;
}) {
  return (
    <PanelRightTapButton
      onClick={onPutAway}
      ariaLabel="Put away canvas"
      tooltip="Put away canvas (⌘\\)"
      className="text-primary"
    />
  );
}
