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

import { memo, useRef, useState, type ReactNode } from "react";

/**
 * A slot a handler (or a render, for the latest box) writes and reads, held in a closure rather
 * than a ref: the React Compiler refuses a component that reads a ref during render or hands a
 * ref-reading function to a call, and a skipped component has no memoisation at all (lane
 * RENDER-2, `pnpm check:compiler-skips`). Never a value the screen draws from — that is state.
 */
export function useSlot<T>(initial: T): { get: () => T; set: (value: T) => void } {
  const [slot] = useState(() => {
    let held = initial;
    return {
      get: () => held,
      set: (value: T) => {
        held = value;
      },
    };
  });
  return slot;
}

/**
 * A box holding the latest value of something the Sheet builds BELOW its early returns (a hook
 * cannot be called there). `put` during render, `get` from a row or a handler: a row the memo
 * kept never acts on the render it was drawn in.
 */
export function useLatestBox<T>(): { put: (value: T) => void; get: () => T } {
  const slot = useSlot<T | null>(null);
  const [box] = useState(() => ({ put: (value: T) => slot.set(value), get: () => slot.get() as T }));
  return box;
}

/**
 * ONE STEADY FUNCTION PER HANDLER NAME (lane RENDER-2). The object returned never changes
 * identity, nor does any function read from it; calling one runs the handler of the LATEST render.
 * A big component the compiler compiles can still leave its handlers unmemoised (the Sheet's
 * `loadTableData`, `handleSort` … are plain values in the compiled output), so every toolbar and
 * header it hands them to redrew on every edit. Route EVENT handlers through this — never a
 * function called while rendering (a steady `columnWidthStyle(field)` would let the compiler
 * cache its answer): those stay direct.
 */
export function useSteadyHandlers<T extends Record<string, (...args: never[]) => unknown>>(handlers: T): T {
  const latest = useSlot<T>(handlers);
  latest.set(handlers);
  const [steady] = useState(() => {
    const made = new Map<PropertyKey, (...args: unknown[]) => unknown>();
    return new Proxy({} as T, {
      get: (_target, key) => {
        let fn = made.get(key);
        if (!fn) {
          fn = (...args: unknown[]) => Reflect.apply(latest.get()[key as keyof T], undefined, args);
          made.set(key, fn);
        }
        return fn;
      },
    });
  });
  return steady;
}

/** A getter for the latest `value` (a handler reads it when it runs, never a stale render). */
export function useLatest<T>(value: T): () => T {
  const box = useLatestBox<T>();
  box.put(value);
  return box.get;
}

/**
 * DELIBERATE MANUAL MEMOISATION ("use no memo", lane RENDER-2): this hook reads and writes a ref
 * during render on purpose — that is its whole job — so it is opted out by name, and
 * `pnpm check:compiler-skips` lists an opt-out apart from a silent skip.
 */
/** A number that moves only when one of `values` changed identity since the last render. */
export function useRowEpoch(values: readonly unknown[]): number {
  "use no memo";
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
  // "use no memo" — THE BOUNDARY IS THE MEMO (lane RENDER-2). Compiled, this body caches
  // `render(row, index)` on [render, row, index]; once the Sheet compiled, `render` stopped
  // changing, so a row whose FACTS changed (a cell opening its editor) re-rendered and returned
  // the cached, stale drawing — the editor never opened. `render` reads the viewer's latest scope,
  // which the compiler cannot see; `sameSheetRow` above is what decides when a row draws.
  "use no memo";
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
 * A plain value by what it holds (JSON), for a table-shape input the Sheet rebuilds when a write
 * re-reads the table (its row actions are a fresh `[]` each time). Falls back to the value itself
 * (a redraw, never a stale row) when it cannot be written out.
 */
export function contentSignature(value: unknown): unknown {
  try {
    return JSON.stringify(value);
  } catch {
    return value;
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
