"use client";

// features/assists/assistClearance.ts
//
// THE FLOATING ASSISTS CONTROL NEVER COVERS CONTENT (list-shell fix D,
// 2026-09-28). Blind judges found the assists pill on the last row's ⋮ (desktop
// lists) and the phone launcher on the pager arrows and card answers
// (/education/quizzes, /education/flashcards, notes). A fixed control cannot
// move out of every page's way, so the page makes room instead: the scroll area
// lying under the control gets a bottom inset exactly as tall as the overlap,
// so its last item scrolls fully above the control. Nothing per page — the dock
// finds whatever scrolls beneath it (a table, a card list, a page body).
//
// The dock marks its visible element(s) with `data-assists-dock`. The inset is
// written as an inline `padding-bottom` on the scroller and remembered, so it is
// removed exactly when the control leaves (or stops overlapping).

import { useEffect } from "react";

const DOCK_SELECTOR = "[data-assists-dock]";
const CLEARED_ATTR = "data-assist-clearance";
/** Breathing room between the scroller's last item and the control. */
const GAP_PX = 8;

export interface ClearanceRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * How much bottom inset a scroller needs so nothing in it hides under the
 * dock: the part of the scroller's VISIBLE bottom edge that the dock covers,
 * plus a gap. 0 when they do not overlap.
 */
export function clearanceFor(
  scroller: ClearanceRect,
  dock: ClearanceRect,
  viewportHeight: number,
): number {
  const visibleBottom = Math.min(scroller.bottom, viewportHeight);
  const overlapsX = dock.left < scroller.right && dock.right > scroller.left;
  const overlapsY = dock.top < visibleBottom && dock.bottom > scroller.top;
  if (!overlapsX || !overlapsY) return 0;
  return Math.ceil(visibleBottom - dock.top + GAP_PX);
}

function isScroller(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const oy = getComputedStyle(el).overflowY;
  return (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1;
}

function scrollersUnder(dock: DOMRect): HTMLElement[] {
  const found = new Set<HTMLElement>();
  const probeY = Math.max(0, Math.min(window.innerHeight - 1, dock.top + dock.height / 2));
  for (const x of [dock.left + 2, dock.left + dock.width / 2, dock.right - 2]) {
    const stack = document.elementsFromPoint?.(x, probeY) ?? [];
    for (const hit of stack) {
      if (hit.closest(DOCK_SELECTOR)) continue;
      for (let el: Element | null = hit; el && el !== document.body; el = el.parentElement) {
        if (isScroller(el)) {
          found.add(el);
          break;
        }
      }
    }
  }
  return [...found];
}

function visibleDockRect(): DOMRect | null {
  for (const el of document.querySelectorAll(DOCK_SELECTOR)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

function clear(el: HTMLElement) {
  el.style.paddingBottom = el.dataset.assistClearancePrev ?? "";
  delete el.dataset.assistClearancePrev;
  el.removeAttribute(CLEARED_ATTR);
}

/** One pass: give every scroller under the dock its inset, drop stale ones. */
export function applyAssistClearance(): void {
  const dock = visibleDockRect();
  const targets = new Map<HTMLElement, number>();
  if (dock) {
    for (const scroller of scrollersUnder(dock)) {
      const need = clearanceFor(scroller.getBoundingClientRect(), dock, window.innerHeight);
      if (need > 0) targets.set(scroller, need);
    }
  }
  for (const el of document.querySelectorAll<HTMLElement>(`[${CLEARED_ATTR}]`)) {
    if (!targets.has(el)) clear(el);
  }
  for (const [el, need] of targets) {
    if (!el.hasAttribute(CLEARED_ATTR)) {
      el.dataset.assistClearancePrev = el.style.paddingBottom;
      el.setAttribute(CLEARED_ATTR, "");
    }
    const current = Number.parseFloat(el.style.paddingBottom) || 0;
    // Only grow: the inset is measured against the visible edge, which the
    // inset itself does not move once the scroller is at its height.
    if (need > current + 1) el.style.paddingBottom = `${need}px`;
  }
}

// ── AUTO-DOCK: THE CONTROL MOVES OFF A CONTROL (list-shell fix D round 2, 2026-09-28) ──────────
//
// A bottom inset only helps at the END of a scroll: mid-page the pill still sat on a Models row
// switch (/user-settings/ai/models), the phone bulb on a switch, the Notifications Text column. So
// wherever it rests, the dock checks what is UNDER it; over an interactive element it lifts to the
// nearest free spot above (published as `--assist-dock-lift`, which AssistsDock adds to its
// `bottom`), and if no free spot exists within reach it YIELDS — faded and click-through
// (`data-assist-dock-yield`) — so the control beneath always takes the click.

const INTERACTIVE =
  'button, a[href], input, select, textarea, label, summary, [role="switch"], [role="checkbox"], [role="radio"], [role="button"], [role="tab"], [role="menuitem"], [role="link"], [contenteditable="true"]';
const LIFT_VAR = "--assist-dock-lift";
const YIELD_ATTR = "data-assist-dock-yield";
const LIFT_STEP_PX = 8;
const LIFT_MAX_PX = 320;
/** The highest a lifted dock may rest: below the shell header. */
const LIFT_TOP_FLOOR_PX = 64;

export interface DockRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * The smallest upward lift (px) at which `isCovered` reports nothing interactive under the dock,
 * 0 when it is already clear, or null when no lift within reach clears it (the dock yields).
 * Pure, so the rule is tested without a browser.
 */
export function liftFor(base: DockRect, isCovered: (r: DockRect) => boolean): number | null {
  if (!isCovered(base)) return 0;
  for (let step = LIFT_STEP_PX; step <= LIFT_MAX_PX; step += LIFT_STEP_PX) {
    const r = { ...base, top: base.top - step, bottom: base.bottom - step };
    if (r.top < LIFT_TOP_FLOOR_PX) break;
    if (!isCovered(r)) return step;
  }
  return null;
}

function coveredInDocument(r: DockRect): boolean {
  const xs = [r.left + 2, (r.left + r.right) / 2, r.right - 2];
  const ys = [r.top + 2, (r.top + r.bottom) / 2, r.bottom - 2];
  for (const x of xs) {
    for (const y of ys) {
      const stack = document.elementsFromPoint?.(x, y) ?? [];
      const under = stack.find((el) => !el.closest(DOCK_SELECTOR));
      if (under?.closest(INTERACTIVE)) return true;
    }
  }
  return false;
}

/** One pass: rest the dock where it covers no control, or let it yield. */
export function applyAssistDockLift(): void {
  const root = document.documentElement;
  const docks = [...document.querySelectorAll<HTMLElement>(DOCK_SELECTOR)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (docks.length === 0) {
    root.style.removeProperty(LIFT_VAR);
    return;
  }
  const current = Number.parseFloat(root.style.getPropertyValue(LIFT_VAR)) || 0;
  const r = docks[0]!.getBoundingClientRect();
  // Where the dock rests with no lift — the lift is measured from there, never from itself.
  const base = { top: r.top + current, bottom: r.bottom + current, left: r.left, right: r.right };
  const lift = liftFor(base, coveredInDocument);
  if (lift === null) {
    root.style.removeProperty(LIFT_VAR);
    for (const d of docks) d.setAttribute(YIELD_ATTR, "");
    return;
  }
  for (const d of docks) d.removeAttribute(YIELD_ATTR);
  if (lift === 0) root.style.removeProperty(LIFT_VAR);
  else if (Math.abs(lift - current) > 0.5) root.style.setProperty(LIFT_VAR, `${lift}px`);
}

/** Keeps the inset and the resting place right while the dock is mounted. */
export function useAssistClearance(active: boolean): void {
  useEffect(() => {
    if (!active || typeof window === "undefined") return undefined;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        applyAssistClearance();
        applyAssistDockLift();
      });
    };
    schedule();
    window.addEventListener("resize", schedule);
    // Any scroller moving changes what lies under the dock (capture: scroll does not bubble).
    document.addEventListener("scroll", schedule, true);
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      mo.disconnect();
      document.documentElement.style.removeProperty(LIFT_VAR);
      for (const el of document.querySelectorAll<HTMLElement>(`[${CLEARED_ATTR}]`)) clear(el);
    };
  }, [active]);
}
