"use client";

/**
 * useDraggableFloat — the platform's one way to make a floating, fixed-position
 * surface (alarm, notice, mini-player, inspector) MOVABLE and remembered.
 *
 * WHY THIS IS SHARED, NOT INLINE (THE PLATFORM-PRIMITIVE RULE): the first
 * consumer is the global schedule alarm, but nothing about dragging a fixed
 * card is about schedules. Any overlay that floats over a person's work must be
 * movable by that person, so the mechanics live here and every future overlay
 * inherits them.
 *
 * THE LAW IT ENFORCES (Arman, 2026-09-12): a floating surface NEVER modifies
 * the page under it. It reserves no space, publishes no height, and shifts
 * nothing. It sits on top, the person moves it wherever they want, and it
 * remembers where they put it.
 *
 * The stored position is the element's top-left in viewport pixels. It is
 * re-clamped on every resize so a window that shrinks can never strand the
 * surface off-screen, and `reset()` always brings it back to its anchor.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface DraggableFloatPosition {
  x: number;
  y: number;
}

interface UseDraggableFloatOptions {
  /** localStorage key for the remembered position. */
  storageKey: string;
  /** The mounted floating surface, or null while a conditional surface is absent. */
  element: HTMLElement | null;
  /** Where the surface sits until the person moves it. */
  anchor: {
    /** CSS `top`/`bottom`/`left`/`right` values applied when un-dragged. */
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
    /** Applied with `left: 50%` style centering when true. */
    centerX?: boolean;
  };
}

/** Smallest gap kept between the surface and the viewport edge. */
const EDGE_MARGIN_PX = 8;

function readStored(storageKey: string): DraggableFloatPosition | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraggableFloatPosition>;
    if (typeof parsed?.x !== "number" || typeof parsed?.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

function writeStored(storageKey: string, value: DraggableFloatPosition | null): void {
  try {
    if (value) window.localStorage.setItem(storageKey, JSON.stringify(value));
    else window.localStorage.removeItem(storageKey);
  } catch {
    // Storage refused (private mode) — the in-memory position still applies.
  }
}

/**
 * Keep the surface WHOLLY on screen. A partially off-screen card clips its own
 * words and its own controls — the close button included — which is how a
 * movable notice turns back into an unclosable one.
 */
function clamp(pos: DraggableFloatPosition, el: HTMLElement | null): DraggableFloatPosition {
  const width = el?.offsetWidth ?? 0;
  const height = el?.offsetHeight ?? 0;
  const maxX = Math.max(EDGE_MARGIN_PX, window.innerWidth - width - EDGE_MARGIN_PX);
  const maxY = Math.max(EDGE_MARGIN_PX, window.innerHeight - height - EDGE_MARGIN_PX);
  return {
    x: Math.min(Math.max(pos.x, EDGE_MARGIN_PX), maxX),
    y: Math.min(Math.max(pos.y, EDGE_MARGIN_PX), maxY),
  };
}

function samePosition(a: DraggableFloatPosition, b: DraggableFloatPosition): boolean {
  return a.x === b.x && a.y === b.y;
}

export function useDraggableFloat({
  storageKey,
  element,
  anchor,
}: UseDraggableFloatOptions) {
  const [position, setPosition] = useState<DraggableFloatPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const grabRef = useRef<{ dx: number; dy: number } | null>(null);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    const stored = readStored(storageKey);
    if (!stored) {
      restoredRef.current = true;
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      restoredRef.current = true;
      setPosition(clamp(stored, element));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey, element]);

  /**
   * A remembered position can be read before this conditional surface mounts,
   * when it has no dimensions yet. Clamp again as soon as it becomes measurable
   * and whenever its compact/expanded content changes; otherwise an old wide
   * card can be restored partly beyond the viewport after a reload.
   */
  useLayoutEffect(() => {
    if (!element) return undefined;

    const keepInViewport = () => {
      const box = element.getBoundingClientRect();
      const escaped =
        box.left < EDGE_MARGIN_PX ||
        box.top < EDGE_MARGIN_PX ||
        box.right > window.innerWidth - EDGE_MARGIN_PX ||
        box.bottom > window.innerHeight - EDGE_MARGIN_PX;
      setPosition((current) => {
        if (current) {
          const next = clamp(current, element);
          return samePosition(current, next) ? current : next;
        }
        return escaped ? clamp({ x: box.left, y: box.top }, element) : current;
      });
    };

    keepInViewport();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(keepInViewport);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [element]);

  // A shrinking window can never strand the surface off-screen.
  useEffect(() => {
    const onResize = () =>
      setPosition((current) => (current ? clamp(current, element) : current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [element]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const el = element;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    grabRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    // Dragging starts from wherever it currently IS, anchored or not.
    setPosition(clamp({ x: rect.left, y: rect.top }, el));
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, [element]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      const grab = grabRef.current;
      if (!grab) return;
      setPosition(
        clamp({ x: event.clientX - grab.dx, y: event.clientY - grab.dy }, element),
      );
    };
    const onUp = () => {
      setDragging(false);
      grabRef.current = null;
      setPosition((current) => {
        writeStored(storageKey, current);
        return current;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, storageKey, element]);

  const reset = useCallback(() => {
    setPosition(null);
    writeStored(storageKey, null);
  }, [storageKey]);

  const style: React.CSSProperties = position
    ? { position: "fixed", left: position.x, top: position.y, right: "auto", bottom: "auto" }
    : {
        position: "fixed",
        top: anchor.top,
        bottom: anchor.bottom,
        left: anchor.centerX ? "50%" : anchor.left,
        right: anchor.right,
        transform: anchor.centerX ? "translateX(-50%)" : undefined,
      };

  return {
    /** Spread onto the element: fixed placement, dragged or anchored. */
    style,
    /** Spread onto the drag handle. */
    dragHandleProps: {
      onPointerDown,
      style: { cursor: dragging ? "grabbing" : "grab", touchAction: "none" } as React.CSSProperties,
    },
    dragging,
    moved: position !== null,
    reset,
  };
}
