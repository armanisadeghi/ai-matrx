"use client";

/**
 * SwipeableRow — iOS Mail-style swipe actions for a list row.
 *
 * Swipe RIGHT reveals the leading (primary) action, swipe LEFT the trailing
 * (usually destructive) action; passing the trigger threshold fires the
 * action on release (with a haptic tick), anything less springs back. The
 * action layers fade/scale in with drag progress, so the row telegraphs
 * exactly what release will do. Vertical scrolling stays untouched
 * (Framer Motion's `drag="x"` direction-locks).
 *
 * Motion is the sanctioned tool for gesture physics (ios-mobile-first —
 * "Framer Motion only for gestures/physics"); the existing mobile image
 * viewer set the precedent.
 */

import React, { useRef } from "react";
import { motion, useAnimationControls } from "motion/react";

import { cn } from "@/lib/utils";

const TRIGGER_PX = 72;
const TRIGGER_VELOCITY = 500;
const MAX_DRAG_PX = 112;

export interface SwipeRowAction {
  icon: React.ReactNode;
  label: string;
  /** Background classes for the revealed layer (e.g. "bg-destructive text-destructive-foreground"). */
  className: string;
  onTrigger: () => void;
}

export function SwipeableRow({
  leading,
  trailing,
  children,
  className,
}: {
  /** Revealed by swiping RIGHT (iOS leading action — primary/positive). */
  leading?: SwipeRowAction;
  /** Revealed by swiping LEFT (iOS trailing action — usually destructive). */
  trailing?: SwipeRowAction;
  children: React.ReactNode;
  className?: string;
}) {
  const controls = useAnimationControls();
  // Suppress the click that lands right after a real drag, so a swipe never
  // ALSO activates the row's tap action.
  const lastDragEndRef = useRef(0);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {leading && (
        <div
          className={cn(
            "absolute inset-y-0 left-0 flex w-1/2 items-center justify-start gap-1.5 pl-4 text-sm font-medium",
            leading.className,
          )}
          aria-hidden
        >
          {leading.icon}
          {leading.label}
        </div>
      )}
      {trailing && (
        <div
          className={cn(
            "absolute inset-y-0 right-0 flex w-1/2 items-center justify-end gap-1.5 pr-4 text-sm font-medium",
            trailing.className,
          )}
          aria-hidden
        >
          {trailing.icon}
          {trailing.label}
        </div>
      )}
      <motion.div
        className="relative"
        drag="x"
        dragConstraints={{
          left: trailing ? -MAX_DRAG_PX : 0,
          right: leading ? MAX_DRAG_PX : 0,
        }}
        dragElastic={0.12}
        animate={controls}
        onClickCapture={(e) => {
          if (Date.now() - lastDragEndRef.current < 250) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onDragEnd={(_, info) => {
          lastDragEndRef.current = Date.now();
          const { x } = info.offset;
          const vx = info.velocity.x;
          const firedTrailing =
            trailing && (x < -TRIGGER_PX || (x < -24 && vx < -TRIGGER_VELOCITY));
          const firedLeading =
            leading && (x > TRIGGER_PX || (x > 24 && vx > TRIGGER_VELOCITY));
          void controls.start({
            x: 0,
            transition: { type: "spring", stiffness: 500, damping: 40 },
          });
          if (firedTrailing) {
            navigator.vibrate?.(10);
            trailing.onTrigger();
          } else if (firedLeading) {
            navigator.vibrate?.(10);
            leading.onTrigger();
          }
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
