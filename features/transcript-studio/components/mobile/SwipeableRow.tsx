"use client";

/**
 * SwipeableRow — iOS-style swipe-to-action list row.
 *
 * - Short swipe reveals a row of action buttons (tap one to run it).
 * - Long/full swipe runs the designated full-swipe action directly.
 * - Swipe LEFT reveals trailing actions (right side); swipe RIGHT reveals
 *   leading actions (left side).
 *
 * Built on `motion` drag so it feels native. Generic on purpose — any list
 * can reuse it.
 */

import { useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, animate, type PanInfo } from "motion/react";
import { cn } from "@/lib/utils";

export interface SwipeAction {
  key: string;
  label: string;
  icon: ReactNode;
  /** Tailwind bg + text classes for the action background. */
  className: string;
  onAction: () => void;
}

interface SwipeableRowProps {
  children: ReactNode;
  leadingActions?: SwipeAction[];
  trailingActions?: SwipeAction[];
  /** Long swipe-right completes this (defaults to the first leading action). */
  leadingFullAction?: SwipeAction;
  /** Long swipe-left completes this (defaults to the last trailing action). */
  trailingFullAction?: SwipeAction;
  className?: string;
}

const ACTION_WIDTH = 76; // px per action button
const FULL_SWIPE_RATIO = 0.55; // fraction of row width to trigger the full action

export function SwipeableRow({
  children,
  leadingActions = [],
  trailingActions = [],
  leadingFullAction,
  trailingFullAction,
  className,
}: SwipeableRowProps) {
  const x = useMotionValue(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const leadingWidth = leadingActions.length * ACTION_WIDTH;
  const trailingWidth = trailingActions.length * ACTION_WIDTH;
  const fullLeft = trailingFullAction ?? trailingActions[trailingActions.length - 1];
  const fullRight = leadingFullAction ?? leadingActions[0];

  const SPRING = { type: "spring", stiffness: 500, damping: 40 } as const;
  const snap = (to: number) => animate(x, to, SPRING);

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    setDragging(false);
    const width = rowRef.current?.offsetWidth ?? 320;
    const fullThreshold = width * FULL_SWIPE_RATIO;
    const pos = x.get();

    // Swipe left (negative) → trailing
    if (pos < 0) {
      if (fullLeft && Math.abs(pos) >= fullThreshold) {
        snap(0);
        fullLeft.onAction();
        return;
      }
      if (trailingWidth > 0 && Math.abs(pos) >= trailingWidth / 2) {
        snap(-trailingWidth);
        return;
      }
    }
    // Swipe right (positive) → leading
    if (pos > 0) {
      if (fullRight && pos >= fullThreshold) {
        snap(0);
        fullRight.onAction();
        return;
      }
      if (leadingWidth > 0 && pos >= leadingWidth / 2) {
        snap(leadingWidth);
        return;
      }
    }
    snap(0);
  };

  const runAction = (action: SwipeAction) => {
    snap(0);
    action.onAction();
  };

  return (
    <div
      ref={rowRef}
      className={cn("relative overflow-hidden rounded-xl", className)}
    >
      {/* Leading actions (revealed on swipe right) */}
      {leadingActions.length > 0 && (
        <div className="absolute inset-y-0 left-0 flex">
          {leadingActions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => runAction(a)}
              style={{ width: ACTION_WIDTH }}
              className={cn(
                "flex h-full flex-col items-center justify-center gap-1 text-xs font-medium",
                a.className,
              )}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Trailing actions (revealed on swipe left) */}
      {trailingActions.length > 0 && (
        <div className="absolute inset-y-0 right-0 flex">
          {trailingActions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => runAction(a)}
              style={{ width: ACTION_WIDTH }}
              className={cn(
                "flex h-full flex-col items-center justify-center gap-1 text-xs font-medium",
                a.className,
              )}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Foreground (draggable) */}
      <motion.div
        drag="x"
        dragDirectionLock
        style={{ x }}
        onDragStart={() => setDragging(true)}
        onDragEnd={handleDragEnd}
        dragConstraints={{
          left: trailingWidth > 0 ? -trailingWidth : 0,
          right: leadingWidth > 0 ? leadingWidth : 0,
        }}
        dragElastic={0.5}
        className={cn("relative touch-pan-y", dragging && "select-none")}
      >
        {children}
      </motion.div>
    </div>
  );
}
