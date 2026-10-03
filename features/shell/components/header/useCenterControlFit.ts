"use client";

// useCenterControlFit — the measured fit for ANY control that sits in
// RouteHeader's center cell (a segmented switch, a mode pill, a picker).
//
// THE DEFECT IT ENDS (2026-10-03, /chat/<id> with the canvas open): the chat
// header's Chat · Work · Advanced switch chose its compact form by VIEWPORT
// breakpoint (`sm:`). With a 640px canvas beside a 1440px window the header's
// row was ~800px — far narrower than "a desktop" — but the viewport still said
// desktop, so the full switch drew over Records / Attached / the page menu and
// ran under the shell's Search. The header lives in the MAIN COLUMN, and only
// a measurement of that column can say what fits.
//
// It answers the same question RouteModeNav answers for route modes, from the
// same geometry, so every center control collapses the same way:
//   1. the densest-first candidates are measured in hidden `w-max` measurers;
//   2. the first candidate that fits the header's TRUE-CENTER slot
//      (`centerSlotWidth`, minus the flank gutter) wins;
//   3. if none fits there, the first that fits RouteHeader's whole center cell
//      wins IN FLOW — `data-route-nav-inflow` on the cell drops the centering
//      inset (styles/shell.css), so it sits beside the title instead of
//      vanishing into a 0px slot;
//   4. if none fits even in flow, `-1`: draw nothing rather than a clipped stub.
// Outside a RouteHeader it measures its own cell.
//
// Mark the smallest candidate's measurer `data-route-nav-min` so RouteHeader
// yields title width to keep it on screen.

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  CENTER_INFLOW_GUTTER,
  centerSlotWidth,
} from "./RouteHeader";

/** Breathing room from the flanks — the same value RouteModeNav keeps. */
export const CENTER_FLANK_GUTTER = 32;

export interface CenterControlFit {
  /** Index into the candidates; -1 = nothing fits. */
  index: number;
  /** Out of the centered slot, in the whole center cell. */
  inflow: boolean;
}

/** Pure choice, exported for tests. Widths are densest-LAST (full first). */
export function chooseCenterFit(
  widths: number[],
  centeredAvail: number,
  inflowAvail: number,
): CenterControlFit {
  for (let i = 0; i < widths.length; i++) {
    if (widths[i]! > 0 && widths[i]! <= centeredAvail) return { index: i, inflow: false };
  }
  for (let i = 0; i < widths.length; i++) {
    if (widths[i]! > 0 && widths[i]! <= inflowAvail) return { index: i, inflow: true };
  }
  return { index: -1, inflow: false };
}

export function useCenterControlFit(
  cellRef: RefObject<HTMLElement | null>,
  candidateRefs: RefObject<HTMLElement | null>[],
  /** Changes whenever the candidates' content changes (labels, active item). */
  contentKey: string,
): CenterControlFit {
  const [fit, setFit] = useState<CenterControlFit>({ index: 0, inflow: false });
  // The caller builds its candidate list inline; read the latest through a ref
  // so the observers are rebuilt only when what is measured changes.
  const candidatesRef = useRef(candidateRefs);
  useLayoutEffect(() => {
    candidatesRef.current = candidateRefs;
  });

  useLayoutEffect(() => {
    const candidates = candidatesRef.current;
    const cell = cellRef.current;
    if (!cell) return;
    const routeHeader = cell.closest<HTMLElement>("[data-route-header-root]");
    const left = routeHeader?.querySelector<HTMLElement>(":scope > [data-route-header-left]");
    const right = routeHeader?.querySelector<HTMLElement>(":scope > [data-route-header-right]");
    const center = cell.closest<HTMLElement>("[data-route-header-center]");

    const compute = () => {
      const bounded = routeHeader
        ? centerSlotWidth(routeHeader.clientWidth, left?.offsetWidth ?? 0, right?.offsetWidth ?? 0)
        : cell.clientWidth;
      const centeredAvail = Math.min(cell.clientWidth, bounded) - CENTER_FLANK_GUTTER / 2;
      // The whole cell's track — not the inset inside it, which in-flow drops —
      // so the choice never depends on itself. +1: clientWidth rounds.
      const inflowAvail = center
        ? center.clientWidth - CENTER_INFLOW_GUTTER + 1
        : -Infinity;
      const widths = candidates.map((r) => r.current?.scrollWidth ?? 0);
      const next = chooseCenterFit(widths, centeredAvail, inflowAvail);
      setFit((prev) => (prev.index === next.index && prev.inflow === next.inflow ? prev : next));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(cell);
    for (const r of candidates) if (r.current) ro.observe(r.current);
    if (routeHeader) ro.observe(routeHeader);
    if (left) ro.observe(left);
    if (right) ro.observe(right);
    if (center) ro.observe(center);
    // RouteHeader writes its geometry as inline styles after this effect runs;
    // follow those writes directly (ResizeObservers wait for a rendered frame).
    const mo = new MutationObserver(compute);
    if (routeHeader) mo.observe(routeHeader, { attributes: true, attributeFilter: ["style"] });
    const inset = cell.closest<HTMLElement>("[data-route-header-inset]");
    if (inset) mo.observe(inset, { attributes: true, attributeFilter: ["style"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
    // contentKey carries what changes in the candidates' content.
  }, [cellRef, contentKey]);

  return fit;
}
