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

/**
 * An empty, inert, aria-hidden box. NOT a button: there is nothing to click in
 * either state it covers, and a dead or disabled-looking control would be a
 * screen telling a lie. It holds width only.
 */
function CanvasHeaderSlotSpacer({ reason }: { reason: "empty" | "open" }) {
  return (
    <div
      className="shrink-0"
      style={CANVAS_HEADER_SLOT_BOX}
      data-canvas-header-slot="reserved"
      data-canvas-header-slot-reason={reason}
      aria-hidden
    />
  );
}

/**
 * Shell header — the canvas control, left of the avatar.
 *
 * WHEREVER THE CANVAS IS AVAILABLE, THE SLOT IS ALWAYS RESERVED. Availability
 * is a route fact (`CanvasSideSheet` raises it on mount, lowers it on unmount),
 * so the box exists from first paint and never changes size afterwards. Only
 * its contents change:
 *
 *   itemCount 0        → inert spacer   (nothing to reopen yet)
 *   itemCount > 0 open → inert spacer   (the canvas pane's own header owns the
 *                                        control while the canvas is open)
 *   itemCount > 0 shut → the real control
 *
 * WHY: unmounting the element pulled every button to its left 44px sideways.
 * A first fix in 2026-09-17 only held the space between OPEN and CLOSED once
 * an item already existed, so the FIRST item both created the box and shoved
 * the row — measured live on production 2026-09-18 (review row 34bfd1e8):
 * Records 1043.39 → 999.39, Canvas 1132 → 1088, Conversation actions 1164 →
 * 1120, Agents for this page 1192 → 1148, and it never came back. That is the
 * shift the owner named on 2026-09-16 (*"causes a shift in the top header
 * buttons"*). It is the same pattern `:root[data-canvas-open="true"]
 * .shell-user-menu-wrapper` already uses for the avatar, which hides with
 * `visibility` so its box survives.
 *
 * Guard: `features/canvas/__tests__/canvas-header-slot-reserved.test.tsx`.
 */
export function CanvasShellHeaderToggle() {
  const { isOpen, isAvailable, itemCount, headlineTitle, reopen } =
    useCanvasHeaderToggle();

  if (!isAvailable) return null;

  if (itemCount === 0) return <CanvasHeaderSlotSpacer reason="empty" />;
  if (isOpen) return <CanvasHeaderSlotSpacer reason="open" />;

  return (
    <div
      className="relative shrink-0"
      style={CANVAS_HEADER_SLOT_BOX}
      data-canvas-header-slot="control"
    >
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
