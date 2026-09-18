"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

export type ScrollEdge = "start" | "end";

export interface ScrollEdgeIntent {
  edge: ScrollEdge;
  id: number;
}

const cancelledIntents = new WeakSet<ScrollEdgeIntent>();

/** Turns a trim adjustment into one finite scroll request. */
export function useTrimEdgeScrollIntent(
  trimStart: number,
  setTrimStart: (value: number) => void,
  trimEnd: number,
  setTrimEnd: (value: number) => void,
) {
  const nextId = useRef(0);
  const [intent, setIntent] = useState<ScrollEdgeIntent>();
  const requestEdge = (edge: ScrollEdge) => {
    nextId.current += 1;
    setIntent({ edge, id: nextId.current });
  };

  return {
    intent,
    setTrimStart: (value: number) => {
      if (value !== trimStart) requestEdge("start");
      setTrimStart(value);
    },
    setTrimEnd: (value: number) => {
      if (value !== trimEnd) requestEdge("end");
      setTrimEnd(value);
    },
    requestEdge,
  };
}

/**
 * Pins the requested edge while rich markdown finishes its asynchronous layout.
 * Explicit user input ends that observation, so users retain scroll ownership.
 */
export function useScrollEdgeIntent(
  intent: ScrollEdgeIntent | undefined,
  containers: ReadonlyArray<RefObject<HTMLElement | null>>,
  rebindKey?: unknown,
) {
  useLayoutEffect(() => {
    if (!intent || cancelledIntents.has(intent)) return;
    let cancelled = false;
    let firstFrame: number | undefined;
    let secondFrame: number | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let mutationObserver: MutationObserver | undefined;
    const stopObserving = () => {
      if (firstFrame !== undefined) cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
    const activeElements = containers
      .map((ref) => ref.current)
      .filter((element): element is HTMLElement => element !== null);
    const scrollToEdge = () => {
      if (cancelled) return;
      for (const element of activeElements) {
        element.scrollTop = intent.edge === "start"
          ? 0
          : Math.max(0, element.scrollHeight - element.clientHeight);
      }
    };
    const cancelForManualInput = () => {
      cancelled = true;
      cancelledIntents.add(intent);
      stopObserving();
    };

    for (const element of activeElements) {
      element.addEventListener("wheel", cancelForManualInput, { passive: true });
      element.addEventListener("touchstart", cancelForManualInput, { passive: true });
      element.addEventListener("keydown", cancelForManualInput);
      element.addEventListener("pointerdown", cancelForManualInput);
    }
    scrollToEdge();
    firstFrame = requestAnimationFrame(() => {
      scrollToEdge();
      secondFrame = requestAnimationFrame(scrollToEdge);
    });
    const ResizeObserverConstructor = globalThis.ResizeObserver;
    resizeObserver = ResizeObserverConstructor
      ? new ResizeObserverConstructor(scrollToEdge)
      : undefined;
    mutationObserver = new MutationObserver(() => {
      for (const element of activeElements) {
        resizeObserver?.observe(element);
        const content = element.firstElementChild;
        if (content) resizeObserver?.observe(content);
      }
      scrollToEdge();
    });
    for (const element of activeElements) {
      resizeObserver?.observe(element);
      const content = element.firstElementChild;
      if (content) resizeObserver?.observe(content);
      mutationObserver.observe(element, { childList: true, subtree: true, characterData: true });
    }

    return () => {
      cancelled = true;
      stopObserving();
      for (const element of activeElements) {
        element.removeEventListener("wheel", cancelForManualInput);
        element.removeEventListener("touchstart", cancelForManualInput);
        element.removeEventListener("keydown", cancelForManualInput);
        element.removeEventListener("pointerdown", cancelForManualInput);
      }
    };
  }, [intent, rebindKey, ...containers]);
}
