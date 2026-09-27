"use client";

// features/data-tables/components/sheet-body-row.tsx — ONE SHEET ROW AT A TIME (lane RENDER-AUDIT).
//
// Measured 2026-09-26 on /data-v2 with the React profiler hook (a copied table of 8 rows, which
// opens in the Sheet): one cell edit rendered ~2,700 components and a colleague's realtime patch
// ~1,500 — every cell of every row, every time — because every row was inline JSX in
// `UserTableViewer`, a 6,000-line component the React Compiler SKIPS (its six disabled
// `react-hooks/exhaustive-deps` lines; `scripts/react-compiler-bailouts.mjs`). A skipped component
// has no memoisation at all, so the memo boundary here is explicit.
//
// A row is drawn again only when:
//   · its record changed identity (the viewer patches ONE row on a write or a realtime notice, and
//     `shareUnchangedRows` keeps every unchanged row's object across a page read), or
//   · one of its own facts changed (ticked, the open cell or the agent's current row, its cells'
//     selection / editing / range flags, a formula error in it, the seed of an edit in it), or
//   · the table's shape changed (`useRowEpoch`: the columns this view draws, their formats, the
//     colours, widths, read-only, wrap, the row actions …).
// The row reads everything through the viewer's LATEST scope (a ref refreshed on every render), so
// a row the memo kept never acts on the render it was drawn in.

import { memo, useRef, type ReactNode } from "react";

/** A number that moves only when one of `values` changed identity since the last render. */
export function useRowEpoch(values: readonly unknown[]): number {
  const held = useRef<{ values: readonly unknown[]; epoch: number } | null>(null);
  const previous = held.current;
  if (
    previous !== null &&
    previous.values.length === values.length &&
    previous.values.every((value, i) => Object.is(value, values[i]))
  ) {
    return previous.epoch;
  }
  const next = { values, epoch: (previous?.epoch ?? 0) + 1 };
  held.current = next;
  return next.epoch;
}

interface SheetBodyRowProps<R> {
  row: R;
  index: number;
  /** The table's shape (`useRowEpoch`). */
  epoch: number;
  /** This row's own facts, compared one by one. */
  facts: readonly unknown[];
  /** Draws the row from the viewer's latest render; never compared. */
  render: (row: R, index: number) => ReactNode;
}

function sameSheetRow<R>(a: SheetBodyRowProps<R>, b: SheetBodyRowProps<R>): boolean {
  return (
    a.row === b.row &&
    a.index === b.index &&
    a.epoch === b.epoch &&
    a.facts.length === b.facts.length &&
    a.facts.every((fact, i) => Object.is(fact, b.facts[i]))
  );
}

export const SheetBodyRow = memo(function SheetBodyRow<R>({ row, index, render }: SheetBodyRowProps<R>) {
  return <>{render(row, index)}</>;
}, sameSheetRow) as <R>(props: SheetBodyRowProps<R> & { key?: string }) => ReactNode;

/**
 * A page read answers fresh objects for every row, even the ones nobody touched; a row that came
 * back exactly as before keeps the object the screen already holds, so it is not drawn again.
 * What is on screen is still exactly what the read answered.
 */
export function shareUnchangedRows<R extends { id: string }>(previous: readonly R[], next: R[]): R[] {
  if (previous.length === 0 || next.length === 0) return next;
  const held = new Map(previous.map((row) => [row.id, row]));
  let reused = 0;
  const shared = next.map((row) => {
    const before = held.get(row.id);
    if (before && sameRow(before, row)) {
      reused += 1;
      return before;
    }
    return row;
  });
  return reused === 0 ? next : shared;
}

function sameRow(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * A choice map by what it holds — the Sheet rebuilds the map on every render, so its identity says
 * nothing. Falls back to the map itself (a redraw, never a stale row) when it cannot be written out.
 */
export function choiceMapSignature(map: ReadonlyMap<string, unknown>): unknown {
  try {
    return JSON.stringify(Array.from(map.entries()));
  } catch {
    return map;
  }
}
