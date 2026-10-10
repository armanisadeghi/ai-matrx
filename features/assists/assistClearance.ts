"use client";

// features/assists/assistClearance.ts
//
// WHERE THE FLOATING ASSISTS CONTROL RESTS, so it never covers what the page shows.
//
//   1. At its resting place (bottom-right) when nothing lies under it.
//   2. Lifted to the nearest free spot above when a control is under it (09-28 round 2).
//   3. In the chrome's own empty space — the list's pager bar, else the header beside its right
//      cluster — when no free spot is in reach (chair ruling, 2026-10-01).
//   4. Faded and click-through (yield) only when even the chrome has no room.
//   A list's rows are never a free spot: the control never rests over a row (DH3-VERIFY-2).
//
// When it rests at (1) over an INNER scroll area, that scroller gets a bottom inset as tall as the
// overlap so its last item scrolls fully above the control (09-28 fix D). Never the page's main
// area: an inset there squeezed the page (data home cards view in a 331 px box, DH3-VERIFY-2).
//
// 🚨 COST (ASSISTS-DOCK-COST, 2026-10-01). The pass was ~40 ms on the data home and ~320 ms on
// /agents/all (20k nodes) per occurrence, once per keystroke. Causes and the rules that close them:
//   - Placement was published as custom properties on <html>. Every write to an inherited custom
//     property on the root restyles the whole document (132 ms on /agents/all), and every pass
//     removed them first to measure the floating place, then wrote them back. Placement now lives
//     on the dock's own fixed box (a few nodes), and is written only when a value changes.
//   - The lift probed 40 steps × 9 `elementsFromPoint`; the slot scan re-collected the bar's
//     content (querySelectorAll + a rect per element) and 9 more hit tests for each of ~180 steps.
//     Now a covered probe jumps past what covered it (a row jumps the whole list), the bar's content
//     is read once per pass and the scan is rect arithmetic, hit-testing only a rect-free candidate.
//   - The pass runs once per 150 ms quiet period, skips while a table is mid-fill (`aria-busy`,
//     the table's own end signal) and ignores changes inside the dock itself.

import { useEffect } from "react";

import { TRANSIENT_OVERLAY_SELECTOR } from "@/lib/layout/floating-chrome";

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

/** Within this many px on every edge, a box IS the main area's box. */
const SAME_BOX_PX = 2;

/**
 * The page's main area (the shell's <main>, anything holding it, the document, and a route's own
 * full-size wrapper inside it — e.g. the agent builder's `h-full overflow-y-auto` root). It is never
 * inset: its children are sized to it, so padding it shrinks the page instead of adding room (the
 * builder grew a ~100 px empty band under both columns a second after load, 2026-10-06).
 */
function isPageMainArea(el: HTMLElement, main: Element | null, mainRect: DOMRect | null): boolean {
  if (el === document.body || el === document.documentElement) return true;
  if (el.tagName === "MAIN" || el.classList.contains("shell-main")) return true;
  if (main === null) return false;
  if (el.contains(main)) return true;
  if (!mainRect || !main.contains(el)) return false;
  const r = el.getBoundingClientRect();
  return (
    Math.abs(r.top - mainRect.top) <= SAME_BOX_PX &&
    Math.abs(r.bottom - mainRect.bottom) <= SAME_BOX_PX &&
    Math.abs(r.left - mainRect.left) <= SAME_BOX_PX &&
    Math.abs(r.right - mainRect.right) <= SAME_BOX_PX
  );
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
  const main = document.querySelector("main");
  const mainRect = main?.getBoundingClientRect() ?? null;
  const probeY = Math.max(0, Math.min(window.innerHeight - 1, dock.top + dock.height / 2));
  for (const x of [dock.left + 2, dock.left + dock.width / 2, dock.right - 2]) {
    const stack = document.elementsFromPoint?.(x, probeY) ?? [];
    const hit = stack.find((el) => !el.closest(DOCK_SELECTOR));
    for (let el: Element | null = hit ?? null; el && el !== document.body; el = el.parentElement) {
      if (el instanceof HTMLElement && isPageMainArea(el, main, mainRect)) break;
      if (isScroller(el)) {
        found.add(el);
        break;
      }
    }
  }
  return [...found];
}

/**
 * The dock's elements, found by one document scan and kept while they stay mounted (a 20k-node
 * page pays ~0.5 ms per scan; the pass used to make several).
 */
let dockEls: HTMLElement[] = [];
function dockElements(): HTMLElement[] {
  if (dockEls.length === 0 || dockEls.some((el) => !el.isConnected)) {
    dockEls = [...document.querySelectorAll<HTMLElement>(DOCK_SELECTOR)];
  }
  return dockEls;
}

/** Scrollers this module inset, so dropping stale insets never scans the document. */
const clearedEls = new Set<HTMLElement>();

function visibleDockRect(): DOMRect | null {
  for (const el of dockElements()) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

function clear(el: HTMLElement) {
  el.style.paddingBottom = el.dataset.assistClearancePrev ?? "";
  delete el.dataset.assistClearancePrev;
  el.removeAttribute(CLEARED_ATTR);
  clearedEls.delete(el);
}

/**
 * One pass: give every inner scroller under the RESTING dock its inset (exactly the overlap — it
 * never only grows), drop stale ones. A lifted or docked control covers nothing, so it needs none.
 */
export function applyAssistClearance(opts: { resting?: boolean } = {}): void {
  const dock = opts.resting === false ? null : visibleDockRect();
  const targets = new Map<HTMLElement, number>();
  if (dock) {
    for (const scroller of scrollersUnder(dock)) {
      const need = clearanceFor(scroller.getBoundingClientRect(), dock, window.innerHeight);
      if (need > 0) targets.set(scroller, need);
    }
  }
  for (const el of [...clearedEls]) {
    if (!el.isConnected) clearedEls.delete(el);
    else if (!targets.has(el)) clear(el);
  }
  for (const [el, need] of targets) {
    if (!el.hasAttribute(CLEARED_ATTR)) {
      el.dataset.assistClearancePrev = el.style.paddingBottom;
      el.setAttribute(CLEARED_ATTR, "");
      clearedEls.add(el);
    }
    // Measured against the scroller's visible bottom edge, which its own padding does not move.
    const current = Number.parseFloat(el.style.paddingBottom) || 0;
    if (Math.abs(need - current) > 1) el.style.paddingBottom = `${need}px`;
  }
}

// ── AUTO-DOCK: THE CONTROL MOVES OFF A CONTROL (list-shell fix D round 2, 2026-09-28) ──────────
//
// A bottom inset only helps at the END of a scroll: mid-page the pill still sat on a Models row
// switch (/user-settings/ai/models), the phone bulb on a switch, the Notifications Text column. So
// wherever it rests, the dock checks what is UNDER it; over an interactive element it lifts to the
// nearest free spot above (published as `--assist-dock-lift`, which AssistsDock adds to its
// `bottom`), and if no free spot exists within reach it docks into a slot or YIELDS — faded and
// click-through (`data-assist-dock-yield`) — so the control beneath always takes the click.

const INTERACTIVE =
  'button, a[href], input, select, textarea, label, summary, [role="switch"], [role="checkbox"], [role="radio"], [role="button"], [role="tab"], [role="menuitem"], [role="link"], [contenteditable="true"]';
/** A list's row (table row, group header, card, list item carrying a row id): never a free spot. */
const ROW = '[data-row-id], [data-matrx-table-group-row], tr, [role="row"]';
const LIFT_VAR = "--assist-dock-lift";
const YIELD_ATTR = "data-assist-dock-yield";
/**
 * The dock is drawn only at a place that has HELD (zero layout shift, Arman's standing rule). The
 * dock's own class hides it with `visibility` while it carries PENDING_ATTR — a hidden box takes no
 * layout space and scores no shift. It mounts pending; every pass that changes its place puts it
 * back to pending in the same frame (before paint), and it is shown again once two consecutive
 * passes agree and the document has loaded (or REVEAL_CAP_MS passed, so a page that never settles
 * still shows it). Before this, the first pass ran against a half-painted page, docked the pill in
 * the header, and a later pass moved it back — visibly, three times a load.
 */
export const PENDING_ATTR = "data-assist-dock-pending";
export const REVEAL_CAP_MS = 4000;

export interface DockRevealState {
  /** The place the last pass chose, as a string; null before the first pass. */
  signature: string | null;
  /** When the dock last went pending; null while it is drawn. */
  pendingSince: number | null;
}

export interface DockRevealStep {
  state: DockRevealState;
  /** What the dock's pending attribute must be after this pass. */
  pending: boolean;
  /** True when another pass is needed to confirm the place held. */
  again: boolean;
}

/** Pure: given the place this pass chose, decide whether the dock may be drawn. */
export function stepDockReveal(
  prev: DockRevealState,
  signature: string,
  now: number,
  documentComplete: boolean,
): DockRevealStep {
  if (signature !== prev.signature) {
    // The place moved (or is the first answer): hide through the move, confirm next pass.
    return { state: { signature, pendingSince: prev.pendingSince ?? now }, pending: true, again: true };
  }
  if (prev.pendingSince === null) return { state: prev, pending: false, again: false };
  if (documentComplete || now - prev.pendingSince >= REVEAL_CAP_MS) {
    return { state: { signature, pendingSince: null }, pending: false, again: false };
  }
  return { state: prev, pending: true, again: true };
}
const LIFT_STEP_PX = 8;
/** Quiet time after the last scroll / DOM change before the dock re-checks what lies under it. */
export const SETTLE_MS = 150;
const LIFT_MAX_PX = 320;
/** The highest a lifted dock may rest: below the shell header. */
const LIFT_TOP_FLOOR_PX = 64;
const ATTENTION_DOCK_SELECTOR =
  '[data-surface-value="admin_attention_dock_collapsed"], [data-surface-value="admin_attention_dock_expanded"], [data-surface-value="admin_attention_dock"]';
// These controls must stay clickable even when a disabled child is wrapped by
// a tooltip: hit-testing sees the wrapper first, so they also participate by
// their visible geometry.
//
// A COMPOSER IS NEVER COVERED (2026-10-02): the dock rested on the chat
// composer's context chip — a small control between the nine hit-test samples,
// over a card that is not itself interactive — until it was dismissed. Every
// agent input shell (`data-agent-input-shell`, both layouts) and anything that
// declares `data-assist-dock-avoid` (the stacked composer's whole column: chips
// row, card, pills) is avoided by its box, so the dock lifts clear of all of it.
const COMPOSER_AVOIDANCE_SELECTOR = "[data-agent-input-shell], [data-assist-dock-avoid]";
const GEOMETRY_AVOIDANCE_SELECTOR = `[data-matrx-table-footer], ${ATTENTION_DOCK_SELECTOR}, ${COMPOSER_AVOIDANCE_SELECTOR}`;

export interface DockRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function overlaps(a: DockRect, b: DockRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function sized(r: DOMRect): boolean {
  return r.width > 0 && r.height > 0;
}

/**
 * What a probe found under the dock: `false` (free), `true` (covered, by something whose box is
 * unknown), or the covering box — the lift then jumps straight past it instead of stepping.
 */
export type Coverage = boolean | DockRect;

/**
 * The smallest upward lift (px, a multiple of 8) at which `isCovered` reports nothing under the
 * dock, 0 when it is already clear, or null when no lift within reach clears it. Pure, so the rule
 * is tested without a browser.
 */
export function liftFor(base: DockRect, isCovered: (r: DockRect) => Coverage): number | null {
  let step = 0;
  while (step <= LIFT_MAX_PX) {
    const r = { ...base, top: base.top - step, bottom: base.bottom - step };
    if (r.top < LIFT_TOP_FLOOR_PX) return null;
    const cover = isCovered(r);
    if (cover === false) return step;
    let next = step + LIFT_STEP_PX;
    if (cover !== true && cover.bottom > cover.top && cover.top < r.bottom) {
      // The smallest 8 px step whose lowest sample row (2 px inside the bottom edge) is above it.
      const past = Math.floor((base.bottom - 2 - cover.top) / LIFT_STEP_PX) * LIFT_STEP_PX + LIFT_STEP_PX;
      next = Math.max(next, past);
    }
    step = next;
  }
  return null;
}

/** Layout reads shared by one pass (each box read once, never per probe). */
interface PassCache {
  avoidance: DOMRect[] | null;
  attention: DOMRect[] | null;
}

/** The footer and attention-dock boxes, from ONE scan per pass. */
function readAvoidance(cache: PassCache) {
  if (cache.avoidance && cache.attention) return;
  cache.avoidance = [];
  cache.attention = [];
  for (const el of document.querySelectorAll<HTMLElement>(GEOMETRY_AVOIDANCE_SELECTOR)) {
    const r = el.getBoundingClientRect();
    if (!sized(r)) continue;
    cache.avoidance.push(r);
    if (el.matches(ATTENTION_DOCK_SELECTOR)) cache.attention.push(r);
  }
}

function geometryAvoidance(cache: PassCache): DOMRect[] {
  readAvoidance(cache);
  return cache.avoidance!;
}

function attentionRects(cache: PassCache): DOMRect[] {
  readAvoidance(cache);
  return cache.attention!;
}

/**
 * The widest gap between two sample columns. A row's copy / menu icon is ~20 px wide, so a gap of
 * 14 px can never step over one (2026-10-09: three columns across a 155 px pill sat 77 px apart and
 * the pill rested on a row's copy icon at 800 px, "over no control" by the samples' count).
 */
const SAMPLE_COLUMN_GAP_PX = 14;

function samplePoints(r: DockRect): [number, number][] {
  const span = Math.max(0, r.right - r.left - 4);
  const columns = Math.max(3, Math.ceil(span / SAMPLE_COLUMN_GAP_PX) + 1);
  const xs = Array.from({ length: columns }, (_, i) => r.left + 2 + (span * i) / (columns - 1));
  const ys = [r.bottom - 2, (r.top + r.bottom) / 2, r.top + 2];
  const out: [number, number][] = [];
  for (const y of ys) for (const x of xs) out.push([x, y]);
  return out;
}

/**
 * What covers `r` among the elements the hit test finds: a row stands for its whole list (one
 * jump clears the list or proves no lift will), a control for itself.
 */
function hitCoverage(r: DockRect, rowsCount: boolean, points: [number, number][] = samplePoints(r)): Coverage {
  for (const [x, y] of points) {
    const stack = document.elementsFromPoint?.(x, y) ?? [];
    // A toast floats over the page for a few seconds; it is never what the pill must clear. Counting
    // it hid and re-placed the pill, which moved the floating clearance, which moved the toast
    // stack — a loop the owner saw as "toasts moving the UI around" (2026-10-08).
    const under = stack.find((el) => !el.closest(DOCK_SELECTOR) && !el.closest(TRANSIENT_OVERLAY_SELECTOR));
    if (!under) continue;
    if (rowsCount) {
      const row = under.closest(ROW);
      if (row) {
        const list = row.parentElement?.getBoundingClientRect();
        if (list && sized(list)) return list;
        const own = row.getBoundingClientRect();
        return sized(own) ? own : true;
      }
    }
    const control = under.closest(INTERACTIVE);
    if (control) {
      const own = control.getBoundingClientRect();
      return sized(own) ? own : true;
    }
  }
  return false;
}

function coveredInDocument(r: DockRect, cache: PassCache): Coverage {
  for (const target of geometryAvoidance(cache)) if (overlaps(r, target)) return target;
  return hitCoverage(r, true);
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
//      `[data-assist-dock-slot="header"]`) — the grouped and cards views, which have no pager.
// Only when neither has room does it still yield. Where a free spot exists the 09-28 lift is kept.
//
// Placement is written on the dock's own fixed box as `--assist-dock-slot-right` /
// `--assist-dock-slot-bottom` (footer) or `--assist-dock-slot-top` (header, so the open panel drops
// DOWN, not off-screen); `data-assist-dock-slot` on <html> names which slot holds it (an attribute,
// no restyle of the page). AssistsDock reads the variables with its own resting place as the
// fallback, so removing them returns it to floating.

const SLOT_ATTR = "data-assist-dock-slot";
const SLOT_RIGHT = "--assist-dock-slot-right";
const SLOT_BOTTOM = "--assist-dock-slot-bottom";
const SLOT_TOP = "--assist-dock-slot-top";
const PLACEMENT_VARS = [SLOT_RIGHT, SLOT_BOTTOM, SLOT_TOP, LIFT_VAR] as const;
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
    // <html> carries the same attribute as the dock's own state ("docked in the footer"): never a bar.
    if (el === document.documentElement || el.closest(DOCK_SELECTOR)) continue;
    const r = visibleRect(el);
    if (r) out.push({ host: el, region: { kind: "footer", band: r, startRight: Math.min(r.right, window.innerWidth) } });
  }
  const explicitHeaders = document.querySelectorAll('[data-assist-dock-slot="header"]');
  for (const el of explicitHeaders) {
    if (el === document.documentElement) continue;
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

/** What the chrome itself shows: its controls, and any element that paints its own text or icon. Read once per bar per pass. */
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
    if (sized(r)) rects.push(r);
  }
  return rects;
}

function coveredInSlot(r: DockRect, content: DOMRect[], cache: PassCache): boolean {
  const pad = { top: r.top, bottom: r.bottom, left: r.left - SLOT_GAP_PX, right: r.right + SLOT_GAP_PX };
  for (const c of content) if (overlaps(pad, c)) return true;
  for (const a of attentionRects(cache)) if (overlaps(r, a)) return true;
  // Anything else laid over the bar (another floating control) still counts — hit-tested only
  // for a candidate the bar's own content left free.
  const mid = (r.top + r.bottom) / 2;
  return hitCoverage(r, false, [[r.left + 2, mid], [(r.left + r.right) / 2, mid], [r.right - 2, mid]]) !== false;
}

/**
 * The bar a docked control rests in, so the hook re-measures when the bar moves: a bar shifts with
 * its pane (rows load, a notice appears) without any resize or child change reaching the page —
 * measured live on /agents/all, where the pager settled 12 px lower and left the pill on a row.
 */
let slotHost: Element | null = null;
export function currentSlotHost(): Element | null {
  return slotHost;
}

// ── The dock's fixed box: where placement is written and what it is measured from ──────────────

const fixedBoxes = new WeakMap<Element, HTMLElement>();

/** The fixed element whose position the placement variables drive (the dock itself if none). */
function fixedBoxOf(dock: HTMLElement): HTMLElement {
  const known = fixedBoxes.get(dock);
  if (known && known.isConnected && known.contains(dock)) return known;
  let box: HTMLElement = dock;
  for (let el: HTMLElement | null = dock; el && el !== document.body; el = el.parentElement) {
    if (getComputedStyle(el).position === "fixed") {
      box = el;
      break;
    }
  }
  fixedBoxes.set(dock, box);
  return box;
}

/** The placement value the dock reads (from its fixed box). Tests and walks read it here. */
export function dockPlacementVar(name: (typeof PLACEMENT_VARS)[number]): string {
  const dock = dockElements()[0];
  return dock ? fixedBoxOf(dock).style.getPropertyValue(name) : "";
}

function setVar(box: HTMLElement, name: string, value: string | null) {
  const now = box.style.getPropertyValue(name);
  if (value === null) {
    if (now !== "") box.style.removeProperty(name);
  } else if (now !== value) box.style.setProperty(name, value);
}

function setAttr(el: Element, name: string, value: string | null) {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** The resting (floating, unlifted) box last measured per fixed box, keyed by what decides it. */
const restingCache = new WeakMap<HTMLElement, { key: string; rect: DockRect }>();

/**
 * Where the dock rests with no lift and no slot. Measured directly when nothing is placed; else
 * from the cache while what decides it (its own offset, the viewport, its size) is unchanged; else
 * by dropping the placement on its own box for one read (a few nodes restyle, never the page).
 */
function restingRect(dock: HTMLElement, box: HTMLElement): DOMRect | DockRect {
  const r = dock.getBoundingClientRect();
  const key = [
    box.style.right,
    box.style.bottom,
    window.innerWidth,
    window.innerHeight,
    Math.round(r.width),
    Math.round(r.height),
    document.documentElement.style.getPropertyValue("--page-bottom-dock-h"),
  ].join("|");
  const placed = PLACEMENT_VARS.some((v) => box.style.getPropertyValue(v) !== "");
  if (!placed) {
    restingCache.set(box, { key, rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } });
    return r;
  }
  const cached = restingCache.get(box);
  if (cached && cached.key === key) return cached.rect;
  for (const v of PLACEMENT_VARS) box.style.removeProperty(v);
  const fresh = dock.getBoundingClientRect();
  restingCache.set(box, { key, rect: { top: fresh.top, bottom: fresh.bottom, left: fresh.left, right: fresh.right } });
  return fresh;
}

/**
 * How far the visible control sits inside the fixed box the slot variables position (the desktop
 * pill lives in a wrapper with safe-area padding; measured live: 12 px, which left the pill on the
 * last row above the pager). The variables place the BOX, so the inset is subtracted.
 */
function insetInFixedBox(dock: HTMLElement, box: HTMLElement): { right: number; bottom: number } {
  if (box === dock) return { right: 0, bottom: 0 };
  const boxRect = box.getBoundingClientRect();
  const dockRect = dock.getBoundingClientRect();
  return { right: Math.max(0, boxRect.right - dockRect.right), bottom: Math.max(0, boxRect.bottom - dockRect.bottom) };
}

export type DockPlacement = "none" | "rest" | "lift" | "slot" | "yield";

function placeAll(
  docks: HTMLElement[],
  boxes: HTMLElement[],
  placement: { lift?: number; slot?: { kind: DockSlotKind; right: string; bottom: string | null; top: string | null } },
  yieldIt: boolean,
) {
  for (const box of boxes) {
    setVar(box, LIFT_VAR, placement.lift ? `${placement.lift}px` : null);
    setVar(box, SLOT_RIGHT, placement.slot?.right ?? null);
    setVar(box, SLOT_BOTTOM, placement.slot?.bottom ?? null);
    setVar(box, SLOT_TOP, placement.slot?.top ?? null);
  }
  setAttr(document.documentElement, SLOT_ATTR, placement.slot?.kind ?? null);
  for (const d of docks) setAttr(d, YIELD_ATTR, yieldIt ? "" : null);
}

/** One pass: rest the dock where it covers nothing, else in the chrome's slot, else yield. */
export function applyAssistDockLift(): DockPlacement {
  const docks = dockElements().filter((el) => sized(el.getBoundingClientRect()));
  slotHost = null;
  if (docks.length === 0) {
    setAttr(document.documentElement, SLOT_ATTR, null);
    return "none";
  }
  const dock = docks[0]!;
  const box = fixedBoxOf(dock);
  const boxes = [...new Set(docks.map(fixedBoxOf))];
  const resting = restingRect(dock, box);
  const base = { top: resting.top, bottom: resting.bottom, left: resting.left, right: resting.right };
  const cache: PassCache = { avoidance: null, attention: null };
  const lift = liftFor(base, (r) => coveredInDocument(r, cache));
  if (lift !== null) {
    lastSlot = null;
    placeAll(docks, boxes, { lift }, false);
    return lift === 0 ? "rest" : "lift";
  }
  const size = { width: base.right - base.left, height: base.bottom - base.top };
  const place = (kind: DockSlotKind, spot: DockRect, host: Element) => {
    slotHost = host;
    // The variables place the fixed BOX; the pill sits inset inside it (an offset no placement changes).
    const inset = insetInFixedBox(dock, box);
    placeAll(
      docks,
      boxes,
      {
        slot: {
          kind,
          right: `${Math.round(window.innerWidth - spot.right - inset.right)}px`,
          bottom: kind === "header" ? "auto" : `${Math.round(window.innerHeight - spot.bottom - inset.bottom)}px`,
          top: kind === "header" ? `${Math.round(spot.top)}px` : null,
        },
      },
      false,
    );
    return "slot" as const;
  };
  // The last answer stands while its bar, the bar's content, the viewport and the dock are unchanged.
  const viewKey = `${window.innerWidth}x${window.innerHeight}|${Math.round(size.width)}x${Math.round(size.height)}`;
  const last = lastSlot;
  if (last && last.host.isConnected && last.viewKey === viewKey) {
    const bar = visibleRect(last.host);
    if (
      bar &&
      boxKey(bar) === last.barKey &&
      contentKey(last.host) === last.contentKey &&
      !attentionRects(cache).some((a) => overlaps(last.spot, a))
    ) {
      return place(last.kind, last.spot, last.host);
    }
  }
  lastSlot = null;
  for (const { region, host } of slotRegions()) {
    const content = chromeContentRects(host);
    const spot = slotSpotFor(region, size, (c) => coveredInSlot(c, content, cache));
    if (!spot) continue;
    lastSlot = { host, kind: region.kind, spot, viewKey, barKey: boxKey(region.band), contentKey: contentKey(host) };
    return place(region.kind, spot, host);
  }
  placeAll(docks, boxes, {}, true);
  return "yield";
}

/** The slot the dock last docked into, and what that answer depended on. */
let lastSlot: {
  host: Element;
  kind: DockSlotKind;
  spot: DockRect;
  viewKey: string;
  barKey: string;
  contentKey: string;
} | null = null;

function boxKey(r: DockRect): string {
  return `${Math.round(r.top)},${Math.round(r.bottom)},${Math.round(r.left)},${Math.round(r.right)}`;
}

/** A bar's content changes (a pager page added, a count reworded) without its own box changing. */
function contentKey(host: Element): string {
  return `${host.getElementsByTagName("*").length}:${host.textContent?.length ?? 0}`;
}

// ── The scheduler ───────────────────────────────────────────────────────────────────────────────

/** A table mid-fill marks itself busy; its end is the signal to measure. Capped so a stuck flag never parks the dock. */
const FILL_SELECTOR =
  '[data-matrx-table-footer][aria-busy="true"], [data-matrx-table-cards-scroll][aria-busy="true"], [data-matrx-table-spreadsheet][aria-busy="true"], table[aria-busy="true"]';
const FILL_CAP_MS = 2000;

let measured = 0;
function measure(name: string, start: number) {
  try {
    // The buffer is bounded: a page left open all day keeps the last few hundred passes.
    if (++measured % 500 === 0) performance.clearMeasures?.(name);
    performance.measure?.(name, { start });
  } catch {
    // A runtime without User Timing Level 3 options: the pass still runs.
  }
}

/** Keeps the inset and the resting place right while the dock is mounted. */
export function useAssistClearance(active: boolean): void {
  useEffect(() => {
    if (!active || typeof window === "undefined") return undefined;
    let frame = 0;
    let settle: ReturnType<typeof setTimeout> | null = null;
    let fillSince = 0;
    let reveal: DockRevealState = { signature: null, pendingSince: performance.now() };
    let lastBox: Element | null = null;
    // The bar holding a docked control (and its pane) is watched, so the control follows the bar.
    let watched: Element | null = null;
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => scheduleSettled());
    const watchSlot = () => {
      const host = currentSlotHost();
      if (host === watched || !ro) return;
      ro.disconnect();
      watched = host;
      for (let el: Element | null = host, n = 0; el && n < 4; el = el.parentElement, n += 1) ro.observe(el);
    };
    // Draw the dock only at a place that has held (see PENDING_ATTR).
    const revealWhenFinal = (placement: DockPlacement) => {
      const docks = dockElements();
      if (docks.length === 0) return;
      const box = fixedBoxOf(docks[0]!);
      const signature = `${placement}|${PLACEMENT_VARS.map((v) => box.style.getPropertyValue(v)).join("|")}|${document.documentElement.getAttribute(SLOT_ATTR) ?? ""}`;
      // A dock that mounted pending (a remount) is pending whatever the state says.
      const fresh = docks.some((el) => el.hasAttribute(PENDING_ATTR));
      const step = stepDockReveal(
        fresh && reveal.pendingSince === null ? { ...reveal, pendingSince: performance.now() } : reveal,
        signature,
        performance.now(),
        document.readyState === "complete",
      );
      reveal = step.state;
      for (const el of docks) setAttr(el, PENDING_ATTR, step.pending ? "" : null);
      if (step.again) scheduleSettled();
    };
    const pass = () => {
      frame = 0;
      if (dockElements().length === 0) {
        // Nothing to place: drop anything an earlier dock left behind, read nothing.
        setAttr(document.documentElement, SLOT_ATTR, null);
        if (clearedEls.size > 0) applyAssistClearance({ resting: false });
        lastBox = null;
        return;
      }
      if (document.querySelector(FILL_SELECTOR)) {
        fillSince ||= performance.now();
        if (performance.now() - fillSince < FILL_CAP_MS) {
          scheduleSettled();
          return;
        }
      }
      fillSince = 0;
      const t0 = performance.now();
      const placement = applyAssistDockLift();
      applyAssistClearance({ resting: placement === "rest" });
      watchSlot();
      revealWhenFinal(placement);
      const first = dockElements()[0];
      lastBox = first ? fixedBoxOf(first) : null;
      measure("assists-dock:pass", t0);
    };
    const schedule = () => {
      if (settle) {
        clearTimeout(settle);
        settle = null;
      }
      if (frame) return;
      frame = requestAnimationFrame(pass);
    };
    // 🚨 NEVER A PASS PER SCROLL FRAME OR PER KEYSTROKE (DATA-HOME-3E, ASSISTS-DOCK-COST). What
    // lies under the dock only matters where the page comes to rest, so scrolling, DOM churn and
    // bar resizes ask for ONE pass once they have been quiet for SETTLE_MS; a window resize, the
    // dock appearing, or a dragged attention dock still answers next frame.
    const scheduleSettled = () => {
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => {
        settle = null;
        schedule();
      }, SETTLE_MS);
    };
    const insideDock = (node: Node | null) => {
      const el = node instanceof Element ? node : node?.parentElement ?? null;
      return Boolean(el && (lastBox?.contains(el) || el.closest(DOCK_SELECTOR)));
    };
    const insideEditor = (node: Node | null) => {
      const el = node instanceof Element ? node : node?.parentElement ?? null;
      return Boolean(el?.closest('[contenteditable="true"], .cm-content'));
    };
    const onScroll = (e: Event) => {
      if (insideDock(e.target as Node | null)) return;
      scheduleSettled();
    };
    schedule();
    window.addEventListener("resize", schedule);
    // Any scroller moving changes what lies under the dock (capture: scroll does not bubble).
    document.addEventListener("scroll", onScroll, true);
    const mo = new MutationObserver((mutations) => {
      let now = false;
      let later = false;
      for (const m of mutations) {
        if (m.type === "attributes") {
          // A dragged attention dock changes only its inline position: follow it next frame.
          if (m.attributeName === "style" && m.target instanceof Element && m.target.matches(ATTENTION_DOCK_SELECTOR)) now = true;
          // A table finished (or started) filling.
          else if (m.attributeName === "aria-busy") later = true;
          continue;
        }
        if (insideDock(m.target)) continue;
        // Typing in an editor rewrites its nodes on every keystroke; the pass
        // after it (elementsFromPoint over a page holding a long notes list)
        // cost 100–170 ms each time the person paused (the Write-mode typing
        // sweep, 2026-10-10). Text growing inside an editor moves nothing under
        // the dock that a scroll or resize would not report.
        if (insideEditor(m.target)) continue;
        // Toasts appearing, stacking and leaving change nothing under the dock.
        if (m.target instanceof Element && m.target.closest(TRANSIENT_OVERLAY_SELECTOR)) continue;
        later = true;
      }
      // The dock's box was replaced (quiet ↔ open): its placement went with it.
      if (lastBox && !lastBox.isConnected) now = true;
      if (now) schedule();
      else if (later) scheduleSettled();
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "aria-busy"],
    });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (settle) clearTimeout(settle);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", onScroll, true);
      mo.disconnect();
      ro?.disconnect();
      for (const el of document.querySelectorAll<HTMLElement>(DOCK_SELECTOR)) {
        const box = fixedBoxOf(el);
        for (const v of PLACEMENT_VARS) box.style.removeProperty(v);
        el.removeAttribute(YIELD_ATTR);
      }
      document.documentElement.removeAttribute(SLOT_ATTR);
      for (const el of document.querySelectorAll<HTMLElement>(`[${CLEARED_ATTR}]`)) clear(el);
    };
  }, [active]);
}
