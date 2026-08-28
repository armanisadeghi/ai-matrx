"use client";

/**
 * useLongPress — pointer-based long-press for grid tiles and list rows.
 *
 * iOS-calibrated: fires after {@link LONG_PRESS_MS} of stillness (movement
 * over the slop radius or scroll cancels it), vibrates when supported, and
 * suppresses the click that the same pointer-up would otherwise deliver so a
 * long-press never ALSO activates the row's tap action.
 *
 * The platform's v3 context menu implements its own touch long-press for
 * entity surfaces; this hook is for feature-local gestures (an action drawer
 * on a capture row / media tile) where that menu does not apply.
 */

import { useCallback, useEffect, useRef } from "react";

const LONG_PRESS_MS = 450;
const MOVE_SLOP_PX = 10;

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onClickCapture: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function useLongPress(onLongPress: () => void): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const onLongPressRef = useRef(onLongPress);
  useEffect(() => {
    onLongPressRef.current = onLongPress;
  }, [onLongPress]);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Mouse users have right-click / visible buttons; long-press is a
      // touch/pen affordance.
      if (e.pointerType === "mouse") return;
      firedRef.current = false;
      originRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        navigator.vibrate?.(10);
        onLongPressRef.current();
      }, LONG_PRESS_MS);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const origin = originRef.current;
      if (!origin) return;
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      if (dx * dx + dy * dy > MOVE_SLOP_PX * MOVE_SLOP_PX) clear();
    },
    [clear],
  );

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (firedRef.current) {
      // The long-press already handled this pointer — swallow the click.
      e.preventDefault();
      e.stopPropagation();
      firedRef.current = false;
    }
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    // iOS Safari raises contextmenu on touch-hold — the drawer IS our menu.
    if (firedRef.current) e.preventDefault();
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClickCapture,
    onContextMenu,
  };
}
