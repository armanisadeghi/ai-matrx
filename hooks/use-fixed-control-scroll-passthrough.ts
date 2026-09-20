"use client";

import {
  useRef,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
} from "react";

interface ScrollGesture {
  startY: number;
  lastY: number;
  target: HTMLElement;
}

interface FixedControlScrollPassthrough {
  onTouchStart: (event: ReactTouchEvent<HTMLElement>) => void;
  onTouchMove: (event: ReactTouchEvent<HTMLElement>) => void;
  onTouchEnd: () => void;
  suppressClickRef: RefObject<boolean>;
}

const SWIPE_THRESHOLD_PX = 4;

function canScrollVertically(element: HTMLElement): boolean {
  if (element.scrollHeight <= element.clientHeight) return false;
  const overflowY = window.getComputedStyle(element).overflowY;
  return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
}

/**
 * A fixed control is outside many routes' inner scroll container. The browser
 * therefore cannot pass a swipe that begins on the control to the page behind
 * it. Find that real page scroller from the visual stack under the finger.
 */
export function scrollTargetBehind(
  source: HTMLElement,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  for (const hit of document.elementsFromPoint(clientX, clientY)) {
    if (hit === source || source.contains(hit) || hit.contains(source)) continue;
    let candidate: HTMLElement | null =
      hit instanceof HTMLElement ? hit : hit.parentElement;
    while (candidate && candidate !== document.body) {
      if (canScrollVertically(candidate)) return candidate;
      candidate = candidate.parentElement;
    }
  }

  const documentScroller = document.scrollingElement;
  return documentScroller instanceof HTMLElement ? documentScroller : null;
}

/**
 * Preserve vertical page scrolling when a touch starts on a fixed interactive
 * control. Taps remain clicks; a real swipe scrolls the surface underneath and
 * suppresses the trailing click exactly as a native page pan would.
 */
export function useFixedControlScrollPassthrough(
  enabled: boolean,
): FixedControlScrollPassthrough {
  const gestureRef = useRef<ScrollGesture | null>(null);
  const suppressClickRef = useRef(false);

  const onTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    if (!enabled || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const target = scrollTargetBehind(
      event.currentTarget,
      touch.clientX,
      touch.clientY,
    );
    if (!target) return;
    suppressClickRef.current = false;
    gestureRef.current = {
      startY: touch.clientY,
      lastY: touch.clientY,
      target,
    };
  };

  const onTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!enabled || !gesture || event.touches.length !== 1) return;
    const nextY = event.touches[0].clientY;
    const totalDelta = nextY - gesture.startY;
    const stepDelta = nextY - gesture.lastY;
    gesture.lastY = nextY;
    if (Math.abs(totalDelta) < SWIPE_THRESHOLD_PX) return;
    suppressClickRef.current = true;
    gesture.target.scrollTop -= stepDelta;
  };

  const onTouchEnd = () => {
    gestureRef.current = null;
    if (!suppressClickRef.current) return;
    requestAnimationFrame(() => {
      suppressClickRef.current = false;
    });
  };

  return { onTouchStart, onTouchMove, onTouchEnd, suppressClickRef };
}
