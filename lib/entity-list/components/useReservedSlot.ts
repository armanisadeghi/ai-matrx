"use client";

/**
 * A TOOLBAR SLOT THAT KEEPS ITS FINAL GEOMETRY BEFORE ITS CONTENT ARRIVES.
 *
 * The page toolbar's two slots (the saved-view tabs on the left, the table's own controls on the
 * right) are filled by the table AFTER the first paint and after the saved views load — so the
 * search box beside them used to jump (the /data home measured CLS 0.11). A slot remembers the
 * size its content last measured, per surface, and reserves it on the next visit: the row is its
 * final shape in the first frame. First visit ever, or a changed strip (a view added or closed),
 * is the one honest shift; the new size is stored for the next visit.
 */
import { useCallback, useLayoutEffect, useState, type CSSProperties } from "react";

interface SlotSize {
  w: number;
  h: number;
}

const storageKey = (surfaceKey: string, name: string) => `matrx:list-slot-size:${surfaceKey}:${name}`;

/**
 * The size a slot reserves on a FIRST visit, before any visit has measured it. Without one the
 * first load of a surface is the one honest shift (the /data home measured CLS 0.068 on a cold
 * browser: tabs 117x31 left, controls 147x34 right, the row 28 -> 34 tall). Only surfaces whose
 * strip is deterministic belong here; the stored measurement always wins once it exists.
 */
const FIRST_VISIT_SIZE: Record<string, SlotSize> = {
  "data-home:tabs": { w: 117, h: 31 },
  "data-home:controls": { w: 147, h: 34 },
  // /agents/all (measured on a cold browser at 1024 and 1440): the same strip, so its first visit holds it too.
  "agents-browse:tabs": { w: 117, h: 31 },
  "agents-browse:controls": { w: 34, h: 34 },
};

/**
 * The first frame is the server's HTML, painted before React hydrates (a second or more in dev), so a
 * layout effect is too late for it. This one-line script sits right after the slot and reserves the
 * remembered size while the HTML is still being parsed — the same numbers, applied earlier.
 */
export function reserveSlotScript(surfaceKey: string, name: string): string {
  return `(function(){try{var e=document.currentScript.previousElementSibling,v=JSON.parse(localStorage.getItem(${JSON.stringify(
    storageKey(surfaceKey, name),
  )}))||${JSON.stringify(FIRST_VISIT_SIZE[`${surfaceKey}:${name}`] ?? null)};if(e&&v&&v.w>0&&v.h>0){e.style.minWidth=v.w+"px";e.style.minHeight=v.h+"px";e.style.display="flex"}}catch(_){}})()`;
}

/** Read the stored size; a missing, malformed or zero entry reserves nothing. */
export function readSlotSize(surfaceKey: string, name: string): SlotSize | null {
  try {
    const raw = window.localStorage.getItem(storageKey(surfaceKey, name));
    const parsed = raw ? (JSON.parse(raw) as Partial<SlotSize>) : null;
    return parsed && Number(parsed.w) > 0 && Number(parsed.h) > 0
      ? { w: Number(parsed.w), h: Number(parsed.h) }
      : (FIRST_VISIT_SIZE[`${surfaceKey}:${name}`] ?? null);
  } catch {
    return FIRST_VISIT_SIZE[`${surfaceKey}:${name}`] ?? null;
  }
}

function writeSlotSize(surfaceKey: string, name: string, size: SlotSize): void {
  try {
    window.localStorage.setItem(storageKey(surfaceKey, name), JSON.stringify(size));
  } catch {
    /* a full or blocked store only costs the reservation */
  }
}

/**
 * `ref` goes on the slot element (it also forwards to `forward`, the page's own slot setter);
 * `style` is the reservation to spread on it, `undefined` while nothing is known or `reserve` is off.
 */
export function useReservedSlot(
  surfaceKey: string | undefined,
  name: string,
  reserve: boolean,
  forward?: (element: HTMLDivElement | null) => void,
): { ref: (element: HTMLDivElement | null) => void; style: CSSProperties | undefined } {
  const [size, setSize] = useState<SlotSize | null>(null);
  // Before paint, so the first frame already holds the reservation.
  useLayoutEffect(() => {
    setSize(surfaceKey ? readSlotSize(surfaceKey, name) : null);
  }, [surfaceKey, name]);

  const [cleanup, setCleanup] = useState<(() => void) | null>(null);
  useLayoutEffect(() => () => cleanup?.(), [cleanup]);

  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      forward?.(element);
      if (!element || !surfaceKey || typeof ResizeObserver === "undefined") return;
      // What the content measures, not the slot (which already holds the reservation).
      const measure = () => {
        const kids = Array.from(element.children);
        const w = Math.round(kids.reduce((sum, kid) => sum + kid.getBoundingClientRect().width, 0));
        const h = Math.round(kids.reduce((max, kid) => Math.max(max, kid.getBoundingClientRect().height), 0));
        if (w > 0 && h > 0) writeSlotSize(surfaceKey, name, { w, h });
      };
      const resize = new ResizeObserver(measure);
      const watchKids = () => {
        resize.disconnect();
        Array.from(element.children).forEach((kid) => resize.observe(kid));
        measure();
      };
      const mutation = new MutationObserver(watchKids);
      mutation.observe(element, { childList: true });
      watchKids();
      setCleanup(() => () => {
        resize.disconnect();
        mutation.disconnect();
      });
    },
    [forward, surfaceKey, name],
  );

  return {
    ref,
    style: reserve && size ? { minWidth: size.w, minHeight: size.h, display: "flex" } : undefined,
  };
}
