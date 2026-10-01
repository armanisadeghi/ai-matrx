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
  // Editors own their internal padding and auto-grow measurements. Insetting
  // a textarea makes the dock inflate the draft, then chase its new size.
  // Walk on to the containing page scroller; dock lift already avoids fields.
  if (el.closest('textarea, input, [role="textbox"], [contenteditable]:not([contenteditable="false"])')) return false;
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
const ATTENTION_DOCK_SELECTOR =
  '[data-surface-value="admin_attention_dock_collapsed"], [data-surface-value="admin_attention_dock_expanded"], [data-surface-value="admin_attention_dock"]';
// These controls must stay clickable even when a disabled child is wrapped by
// a tooltip: hit-testing sees the wrapper first, so they also participate by
// their visible geometry.
const GEOMETRY_AVOIDANCE_SELECTOR =
  `[data-matrx-table-footer], ${ATTENTION_DOCK_SELECTOR}`;

export interface DockRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function overlaps(a: DockRect, b: DockRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function overlapsGeometryAvoidance(r: DockRect): boolean {
  for (const el of document.querySelectorAll<HTMLElement>(GEOMETRY_AVOIDANCE_SELECTOR)) {
    const target = el.getBoundingClientRect();
    if (target.width > 0 && target.height > 0 && overlaps(r, target)) return true;
  }
  return false;
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
  if (overlapsGeometryAvoidance(r)) return true;
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

// ── THE RESERVED SLOT: NO FREE SPOT → THE DOCK JOINS THE PAGE'S CHROME (chair ruling, 2026-10-01) ──
//
// On a full-width list every row carries copy + menu buttons at the right, so no lift within reach
// is free and the dock used to YIELD — faded to 30 % over the last row's actions ("Visit Log 300
// 1797", data home). A half-visible control over other controls is a screen that lies. Linear and
// Notion never float a badge over a row's actions; they give it a place in the chrome. So when no
// free spot exists the dock rests in the chrome's own empty space, at full opacity, never over
// anything it would hide:
//   1. the list's pager/footer bar (`[data-matrx-table-footer]`, or any `[data-assist-dock-slot="footer"]`),
//      scanned from its right edge leftward;
//   2. else the header bar, just left of its right cluster (`[data-header-right-set]`, or any
//      `[data-assist-dock-slot="header"]`).
// Only when neither has room does it still yield. Where a free spot exists the 09-28 lift is kept.
//
// Placement is published on <html> as `--assist-dock-slot-right` / `--assist-dock-slot-bottom`
// (footer) or `--assist-dock-slot-top` (header, so the open panel drops DOWN, not off-screen), and
// `data-assist-dock-slot` names which slot holds it. AssistsDock reads them with its own resting
// place as the fallback, so removing them returns it to floating.

const SLOT_ATTR = "data-assist-dock-slot";
const SLOT_VARS = ["--assist-dock-slot-right", "--assist-dock-slot-bottom", "--assist-dock-slot-top"] as const;
/** Breathing room between the docked control and the chrome's own content. */
const SLOT_GAP_PX = 6;
const SLOT_STEP_PX = 8;

export type DockSlotKind = "footer" | "header";

export interface DockSlotRegion {
  kind: DockSlotKind;
  /** The band the dock may rest in (the bar's box). */
  band: DockRect;
  /** The right-most x the dock may reach (the bar's edge, or the start of the header's right cluster). */
  startRight: number;
}

/**
 * The right-most spot in a slot's band where a `width`×`height` dock, centered on the band, covers
 * nothing (`isCovered` false), or null when the band has no room. Pure, so the rule is tested
 * without a browser.
 */
export function slotSpotFor(
  region: DockSlotRegion,
  size: { width: number; height: number },
  isCovered: (r: DockRect) => boolean,
): DockRect | null {
  const mid = (region.band.top + region.band.bottom) / 2;
  const top = Math.round(mid - size.height / 2);
  const bottom = top + size.height;
  for (
    let right = Math.floor(region.startRight - SLOT_GAP_PX);
    right - size.width >= region.band.left + SLOT_GAP_PX;
    right -= SLOT_STEP_PX
  ) {
    const r = { top, bottom, left: right - size.width, right };
    if (!isCovered(r)) return r;
  }
  return null;
}

function visibleRect(el: Element | null): DOMRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) return null;
  return r;
}

/** The slots on screen, footer first (the ruling's order). */
function slotRegions(): { region: DockSlotRegion; host: Element }[] {
  const out: { region: DockSlotRegion; host: Element }[] = [];
  const footers = document.querySelectorAll('[data-matrx-table-footer], [data-assist-dock-slot="footer"]');
  for (const el of footers) {
    if (el.closest(DOCK_SELECTOR)) continue;
    const r = visibleRect(el);
    if (r) out.push({ host: el, region: { kind: "footer", band: r, startRight: Math.min(r.right, window.innerWidth) } });
  }
  const explicitHeaders = document.querySelectorAll('[data-assist-dock-slot="header"]');
  for (const el of explicitHeaders) {
    const r = visibleRect(el);
    if (r) out.push({ host: el, region: { kind: "header", band: r, startRight: Math.min(r.right, window.innerWidth) } });
  }
  const cluster = document.querySelector("[data-header-right-set]");
  const header = cluster?.closest("header") ?? null;
  const clusterRect = visibleRect(cluster);
  const headerRect = visibleRect(header);
  if (header && clusterRect && headerRect) {
    out.push({ host: header, region: { kind: "header", band: headerRect, startRight: clusterRect.left } });
  }
  return out;
}

/** What the chrome itself shows: its controls, and any element that paints its own text or icon. */
function chromeContentRects(host: Element): DOMRect[] {
  const rects: DOMRect[] = [];
  for (const el of host.querySelectorAll("*")) {
    if (el.closest(DOCK_SELECTOR)) continue;
    const paints =
      el.matches(INTERACTIVE) ||
      el.matches("svg, img, canvas, video") ||
      [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
    if (!paints) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) rects.push(r);
  }
  return rects;
}

function coveredInSlot(r: DockRect, host: Element): boolean {
  const pad = { top: r.top, bottom: r.bottom, left: r.left - SLOT_GAP_PX, right: r.right + SLOT_GAP_PX };
  for (const c of chromeContentRects(host)) if (overlaps(pad, c)) return true;
  for (const el of document.querySelectorAll<HTMLElement>(ATTENTION_DOCK_SELECTOR)) {
    const a = el.getBoundingClientRect();
    if (a.width > 0 && a.height > 0 && overlaps(r, a)) return true;
  }
  // Anything else laid over the bar (another floating control) still counts.
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

function clearSlot(root: HTMLElement) {
  for (const v of SLOT_VARS) root.style.removeProperty(v);
  root.removeAttribute(SLOT_ATTR);
}

function placeInSlot(root: HTMLElement, kind: DockSlotKind, spot: DockRect) {
  root.setAttribute(SLOT_ATTR, kind);
  root.style.setProperty("--assist-dock-slot-right", `${Math.round(window.innerWidth - spot.right)}px`);
  if (kind === "header") {
    root.style.setProperty("--assist-dock-slot-top", `${Math.round(spot.top)}px`);
    root.style.setProperty("--assist-dock-slot-bottom", "auto");
  } else {
    root.style.removeProperty("--assist-dock-slot-top");
    root.style.setProperty("--assist-dock-slot-bottom", `${Math.round(window.innerHeight - spot.bottom)}px`);
  }
}

/** One pass: rest the dock where it covers no control, else in the chrome's slot, else yield. */
export function applyAssistDockLift(): void {
  const root = document.documentElement;
  const visibleDocks = () =>
    [...document.querySelectorAll<HTMLElement>(DOCK_SELECTOR)].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  // Measure from the dock's own resting place: drop last pass's slot so the rect is the floating one.
  clearSlot(root);
  const docks = visibleDocks();
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
    const size = { width: r.width, height: r.height };
    for (const { region, host } of slotRegions()) {
      const spot = slotSpotFor(region, size, (c) => coveredInSlot(c, host));
      if (spot) {
        placeInSlot(root, region.kind, spot);
        for (const d of docks) d.removeAttribute(YIELD_ATTR);
        return;
      }
    }
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
    const mo = new MutationObserver((mutations) => {
      // A dragged attention dock changes only its inline position. Watch that
      // style specifically, while ignoring clearance's own padding writes so
      // the next pass cannot schedule itself forever.
      if (
        mutations.some(
          (mutation) =>
            mutation.type === "childList" ||
            (mutation.type === "attributes" &&
              mutation.target instanceof Element &&
              mutation.target.matches(ATTENTION_DOCK_SELECTOR)),
        )
      ) {
        schedule();
      }
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      mo.disconnect();
      document.documentElement.style.removeProperty(LIFT_VAR);
      clearSlot(document.documentElement);
      for (const el of document.querySelectorAll<HTMLElement>(`[${CLEARED_ATTR}]`)) clear(el);
    };
  }, [active]);
}
