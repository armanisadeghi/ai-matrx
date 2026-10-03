"use client";

// lib/entity-list/useHeaderRowFit.ts
//
// ONE HEADER ROW WHEN IT FITS (owner, /board/all on an iPad, 2026-10-02: two rows of controls above
// the first record "massively wasteful"). The list shell draws its lanes, organization filter and
// page actions in one row and its toolbar (search, Filters, Columns, View, the table's saved views)
// in a second. This hook answers whether both fit in ONE row at the row's current width, measured
// from the real controls — never a breakpoint, because a page with seven lanes needs the second row
// at a width where a page with one lane does not.
//
// The measurements are each control's own natural width, so they read the same whether the toolbar
// is drawn in the shared row or below it: the answer cannot oscillate as the layout flips.

import { useEffect, useState, type RefObject } from "react";

/** The search box's floor when its computed min-width is unreadable (the toolbar's `sm:min-w-40`). */
const SEARCH_MIN_FALLBACK_PX = 160;

function visibleWidth(el: Element | null): number {
  if (!(el instanceof HTMLElement)) return 0;
  return el.offsetParent === null && getComputedStyle(el).position !== "fixed" ? 0 : el.offsetWidth;
}

function measureFits(row: HTMLElement): boolean | null {
  const header = row.parentElement;
  const toolbar = header?.querySelector<HTMLElement>("[data-entity-list-toolbar]");
  if (!toolbar) return null;
  const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
  const toolbarGap = Number.parseFloat(getComputedStyle(toolbar).columnGap) || 0;

  // Toolbar: every control but the search at its own width, plus the search's floor.
  const toolbarParts = Array.from(toolbar.children).filter(
    (child) => !child.hasAttribute("data-entity-list-search-box") && visibleWidth(child) > 0,
  );
  // The search box's own floor at this width (`sm:min-w-40 lg:min-w-56`), read, never assumed.
  const search = toolbar.querySelector<HTMLElement>("[data-entity-list-search-box]");
  const searchMin = (search && Number.parseFloat(getComputedStyle(search).minWidth)) || SEARCH_MIN_FALLBACK_PX;
  const toolbarMin =
    searchMin +
    toolbarParts.reduce((sum, child) => sum + visibleWidth(child), 0) +
    toolbarParts.length * toolbarGap;

  // Lanes at their natural width (the tab strip scrolls when squeezed, so read scrollWidth).
  const lanesSlot = row.querySelector<HTMLElement>("[data-entity-list-lanes]");
  const lanesStrip = lanesSlot?.querySelector<HTMLElement>('[role="tablist"]');
  const lanes = lanesStrip && visibleWidth(lanesStrip) > 0 ? lanesStrip.scrollWidth : visibleWidth(lanesSlot ?? null);
  const org = visibleWidth(row.querySelector("[data-entity-list-org]"));
  const actions = visibleWidth(row.querySelector("[data-entity-list-actions]"));

  const parts = [lanes, toolbarMin, org, actions].filter((w) => w > 0);
  const need = parts.reduce((sum, w) => sum + w, 0) + Math.max(0, parts.length - 1) * gap;
  return need <= row.clientWidth;
}

/** True when the list header's two control rows fit in one; always false while `enabled` is false. */
export function useHeaderRowFit(rowRef: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [fits, setFits] = useState(false);

  useEffect(() => {
    const row = rowRef.current;
    if (!enabled || !row || typeof ResizeObserver === "undefined") return;
    const header = row.parentElement;
    // One measurement per burst of changes (a timer, not a frame: a background tab gets no frames).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const next = measureFits(row);
        if (next !== null) setFits((prev) => (prev === next ? prev : next));
      });
    };
    // Size changes of the row and the controls in it…
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    const watched = [
      row.querySelector('[data-entity-list-lanes] [role="tablist"]'),
      row.querySelector("[data-entity-list-org]"),
      row.querySelector("[data-entity-list-actions]"),
      header?.querySelector("[data-entity-list-toolbar]") ?? null,
    ];
    for (const el of watched) if (el) observer.observe(el);
    // …and controls that arrive after the first paint (the organization filter once counts land,
    // the table's saved views, a lane's count): none of them resize a full-width toolbar row.
    const mutations = new MutationObserver(measure);
    if (header) mutations.observe(header, { childList: true, subtree: true, characterData: true });
    measure();
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      mutations.disconnect();
    };
    // `fits` re-attaches the observers: the toolbar remounts when it changes rows.
  }, [rowRef, enabled, fits]);

  return enabled && fits;
}
