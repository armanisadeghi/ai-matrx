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
  /**
   * Fixed controls a person must still be able to use. A dragged surface is
   * moved to the nearest clear position when it would cover one of these.
   * Anchored surfaces keep their CSS-owned placement.
   */
  exclusion?: {
    selector: string;
    gap?: number;
  };
}

/** Smallest gap kept between the surface and the viewport edge. */
const EDGE_MARGIN_PX = 8;

function overlaps(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

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

/**
 * Keep an explicitly dragged card off a declared fixed control without
 * reserving page space. The nearest clear candidate wins, so a safe saved
 * coordinate remains untouched and an unsafe one moves only as far as needed.
 */
function avoidExclusions(
  pos: DraggableFloatPosition,
  el: HTMLElement | null,
  exclusion: UseDraggableFloatOptions["exclusion"],
): DraggableFloatPosition {
  const bounded = clamp(pos, el);
  if (!el || !exclusion || typeof document === "undefined") return bounded;

  const width = el.offsetWidth;
  const height = el.offsetHeight;
  const gap = exclusion.gap ?? EDGE_MARGIN_PX;
  const excluded = [...document.querySelectorAll<HTMLElement>(exclusion.selector)]
    .map((target) => target.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  const rectFor = (candidate: DraggableFloatPosition) => ({
    left: candidate.x,
    top: candidate.y,
    right: candidate.x + width,
    bottom: candidate.y + height,
  });
  const isClear = (candidate: DraggableFloatPosition) =>
    !excluded.some((target) => overlaps(rectFor(candidate), target));

  if (isClear(bounded)) return bounded;

  const candidates = excluded
    .flatMap((target) => [
      { x: bounded.x, y: target.top - height - gap },
      { x: bounded.x, y: target.bottom + gap },
      { x: target.left - width - gap, y: bounded.y },
      { x: target.right + gap, y: bounded.y },
    ])
    .map((candidate) => clamp(candidate, el));
  const clearCandidates = candidates.filter(isClear);
  if (clearCandidates.length === 0) return bounded;

  return clearCandidates.reduce((nearest, candidate) => {
    const nearestDistance = Math.hypot(nearest.x - bounded.x, nearest.y - bounded.y);
    const candidateDistance = Math.hypot(candidate.x - bounded.x, candidate.y - bounded.y);
    return candidateDistance < nearestDistance ? candidate : nearest;
  });
}

function samePosition(a: DraggableFloatPosition, b: DraggableFloatPosition): boolean {
  return a.x === b.x && a.y === b.y;
}

export function useDraggableFloat({
  storageKey,
  element,
  anchor,
  exclusion,
}: UseDraggableFloatOptions) {
  const [position, setPosition] = useState<DraggableFloatPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const grabRef = useRef<{ dx: number; dy: number } | null>(null);
  /** The person's chosen coordinate, before any temporary collision adjustment. */
  const preferredPositionRef = useRef<DraggableFloatPosition | null>(null);
  const draggedRef = useRef(false);
  const restoredRef = useRef(false);
  const geometryFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (restoredRef.current) return;
    // Wait for the conditional surface itself. Resolving against a null element
    // loses its dimensions and delays an otherwise deterministic restoration.
    if (!element) return;
    const stored = readStored(storageKey);
    if (!stored) {
      restoredRef.current = true;
      return;
    }
    // Defer the first paint update so restoration does not create a cascading
    // render from the effect that reads browser storage.
    const restoreTimer = window.setTimeout(() => {
      restoredRef.current = true;
      preferredPositionRef.current = stored;
      setPosition(avoidExclusions(stored, element, exclusion));
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [storageKey, element, exclusion]);

  /**
   * A remembered position can be read before this conditional surface mounts,
   * when it has no dimensions yet. Clamp again as soon as it becomes measurable
   * and whenever its compact/expanded content changes; otherwise an old wide
   * card can be restored partly beyond the viewport after a reload.
   */
  useLayoutEffect(() => {
    if (!element) return undefined;

    const reconcilePosition = () => {
      const preferred = preferredPositionRef.current;
      if (!preferred) return;
      const next = avoidExclusions(preferred, element, exclusion);
      setPosition((current) => (current && samePosition(current, next) ? current : next));
    };
    const scheduleReconcile = () => {
      if (geometryFrameRef.current !== null) return;
      geometryFrameRef.current = window.requestAnimationFrame(() => {
        geometryFrameRef.current = null;
        reconcilePosition();
      });
    };

    reconcilePosition();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleReconcile);
    observer?.observe(element);
    const observeExclusions = () => {
      if (!exclusion) return;
      document
        .querySelectorAll<HTMLElement>(exclusion.selector)
        .forEach((target) => observer?.observe(target));
    };
    observeExclusions();
    const mutations =
      exclusion && typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            observeExclusions();
            scheduleReconcile();
          })
        : null;
    mutations?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleReconcile);
    window.addEventListener("scroll", scheduleReconcile, true);
    return () => {
      observer?.disconnect();
      mutations?.disconnect();
      window.removeEventListener("resize", scheduleReconcile);
      window.removeEventListener("scroll", scheduleReconcile, true);
      if (geometryFrameRef.current !== null) window.cancelAnimationFrame(geometryFrameRef.current);
      geometryFrameRef.current = null;
    };
  }, [element, exclusion]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const el = element;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    grabRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    draggedRef.current = false;
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, [element, exclusion]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      const grab = grabRef.current;
      if (!grab) return;
      const preferred = { x: event.clientX - grab.dx, y: event.clientY - grab.dy };
      preferredPositionRef.current = preferred;
      draggedRef.current = true;
      setPosition(avoidExclusions(preferred, element, exclusion));
    };
    const onUp = () => {
      setDragging(false);
      grabRef.current = null;
      if (draggedRef.current) writeStored(storageKey, preferredPositionRef.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, storageKey, element, exclusion]);

  const reset = useCallback(() => {
    preferredPositionRef.current = null;
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
