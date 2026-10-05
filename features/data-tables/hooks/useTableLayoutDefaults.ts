"use client";

/**
 * useTableLayoutDefaults — the layout defaults for a data table, from the store's own knob
 * (`custom/grid_layout`, via `custom.grid_layout`), resolved for the TABLE's organization (not
 * whichever one the person has active — a shared table looks the way its owners set it up):
 * layout (auto | fit | scroll), how many columns still share the width under auto, and row height.
 *
 * Precedence: a person's own per-view Layout choice (URL / saved view) wins over these; these win
 * over nothing else — they ARE the default.
 *
 * Until the knob answers, the grid renders with the platform's seeded values, so there is no flash
 * of a different layout for the overwhelmingly common organization that never changed them. A
 * failed read is logged with its cause and the seeded values stay in force.
 */

import { useEffect, useState } from "react";

import { gridLayoutDefaults } from "../data-source/record-store";
import { locateTable } from "../data-source/locate-table";

import {
  parseLayoutMode,
  parseRowDensity,
  type TableLayoutMode,
  type TableRowDensity,
} from "../table-view-url";

export type TableLayoutDefaults = {
  layout: TableLayoutMode;
  fitMaxColumns: number;
  rowHeight: TableRowDensity;
};

/** The platform's seeded values — the render-before-answer placeholder. */
export const SEEDED_TABLE_LAYOUT_DEFAULTS: TableLayoutDefaults = {
  layout: "auto",
  fitMaxColumns: 8,
  rowHeight: "normal",
};

const cache = new Map<string, Promise<TableLayoutDefaults>>();

/** The store's answer for this table; a store that cannot answer keeps the seeded values. */
async function load(tableId: string): Promise<TableLayoutDefaults> {
  const located = await locateTable(tableId);
  const answer = located.ok ? await gridLayoutDefaults(located.home, tableId) : null;
  if (!answer) return SEEDED_TABLE_LAYOUT_DEFAULTS;
  const n = Number(answer.fitMaxColumns);
  return {
    layout: parseLayoutMode(answer.layout),
    fitMaxColumns: Number.isFinite(n) && n >= 2 && n <= 30 ? Math.round(n) : SEEDED_TABLE_LAYOUT_DEFAULTS.fitMaxColumns,
    rowHeight: parseRowDensity(answer.rowHeight),
  };
}

export function useTableLayoutDefaults(tableId: string | null | undefined): TableLayoutDefaults {
  const [defaults, setDefaults] = useState<TableLayoutDefaults>(SEEDED_TABLE_LAYOUT_DEFAULTS);
  useEffect(() => {
    if (!tableId) return;
    let cancelled = false;
    let pending = cache.get(tableId);
    if (!pending) {
      pending = load(tableId);
      cache.set(tableId, pending);
    }
    pending
      .then((value) => {
        if (!cancelled) setDefaults(value);
      })
      .catch((err) => {
        cache.delete(tableId);
        console.error("Table layout defaults could not be read; the platform's seeded defaults stay in force.", err);
      });
    return () => {
      cancelled = true;
    };
  }, [tableId]);
  return defaults;
}
