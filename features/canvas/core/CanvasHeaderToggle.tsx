"use client";

/**
 * Canvas open/close control in the shell header — one of the three fixed
 * header controls (features/shell/FEATURE.md § The header right set).
 * Replaces the bottom-right CanvasReopenChip pill.
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
} from "@ai-matrx/tap-target/buttons";
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

/**
 * THE SLOT IS PART OF THE HEADER, NOT PART OF THE CANVAS.
 *
 * Exactly `--matrx-tap-target-size` (2.75rem / 44px outside tables) — the same
 * expression `.matrx-tap-target` itself uses, so the reserved box and the real
 * control are identical to the pixel even where that variable is overridden.
 */
const CANVAS_HEADER_SLOT_BOX = {
  width: "var(--matrx-tap-target-size, 2.75rem)",
  height: "var(--matrx-tap-target-size, 2.75rem)",
} as const;

export const CANVAS_EMPTY_TOOLTIP =
  "Canvas is empty — open a document, artifact or result in the canvas and it appears here";

/**
 * Shell header — the canvas control.
 *
 * WHEREVER THE CANVAS IS AVAILABLE, THE SLOT IS ALWAYS RESERVED AND ALWAYS
 * HOLDS THE CONTROL. Availability is a route fact (`CanvasSideSheet` raises
 * it on mount, lowers it on unmount), so the box exists from first paint and
 * never changes size afterwards. Only the control's STATE changes:
 *
 *   itemCount 0        → the button, `disabled`, tooltip says why
 *   itemCount > 0 shut → the button opens the canvas (most recent item)
 *   itemCount > 0 open → the button is pressed and puts the canvas away
 *
 * WHY THE FIXED BOX: unmounting the element pulled every button to its left
 * 44px sideways — measured live on production 2026-09-18 (review row
 * 34bfd1e8): Records 1043.39 → 999.39, Canvas 1132 → 1088, Conversation
 * actions 1164 → 1120, Agents for this page 1192 → 1148 — the shift the owner
 * named on 2026-09-16 (*"causes a shift in the top header buttons"*).
 *
 * WHY A DISABLED BUTTON AND NOT AN INERT SPACER (2026-09-19): the owner's
 * ruling for the whole header set — *"never hiding things and only disabling
 * when inactive"*. A disabled control that names its reason is honest; an
 * invisible box teaches nobody where the canvas lives.
 *
 * Guard: `features/canvas/__tests__/canvas-header-slot-reserved.test.tsx`.
 */
export function CanvasShellHeaderToggle() {
  const { isOpen, isAvailable, itemCount, headlineTitle, reopen, putAway } =
    useCanvasHeaderToggle();

  if (!isAvailable) return null;

  const state = itemCount === 0 ? "empty" : isOpen ? "open" : "closed";
  const ariaLabel =
    state === "empty"
      ? "Canvas (empty)"
      : state === "open"
        ? `Put away canvas — ${headlineTitle}`
        : `Open canvas — ${headlineTitle}`;
  const tooltip =
    state === "empty"
      ? CANVAS_EMPTY_TOOLTIP
      : state === "open"
        ? `Put away canvas — ${headlineTitle} (⌘\\)`
        : `Open canvas — ${headlineTitle} (⌘\\)`;

  return (
    <div
      className="relative shrink-0"
      style={CANVAS_HEADER_SLOT_BOX}
      data-canvas-header-slot="control"
      data-canvas-header-slot-state={state}
    >
      <LayersTapButton
        onClick={state === "open" ? putAway : reopen}
        disabled={state === "empty"}
        ariaLabel={ariaLabel}
        tooltip={tooltip}
        className={cn(
          state === "empty" ? "text-muted-foreground" : "text-primary",
          state === "open" && "bg-primary/10",
          state !== "empty" && "hover:bg-primary/10",
        )}
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

/** Canvas pane header — put away (panel slides right). */
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
