"use client";

/**
 * useTableLayoutDefaults — the ORGANIZATION's layout defaults for a data table.
 *
 * Three knobs (migrations/udt_layout_default_knobs.sql), resolved for the
 * organization the TABLE belongs to (not whichever one the person has active —
 * a shared table looks the way its owners set it up):
 *
 *   extensibility.user_tables.default_layout      auto | fit | scroll
 *   extensibility.user_tables.fit_max_columns     how many columns still share the width under auto
 *   extensibility.user_tables.default_row_height  compact | normal | tall
 *
 * Precedence: a person's own per-view Layout choice (URL / saved view) wins
 * over these; these win over nothing else — they ARE the default.
 *
 * Until the knobs answer, the grid renders with the platform's seeded values
 * (the same literals the migration seeds), so there is no flash of a different
 * layout for the overwhelmingly common organization that never changed them.
 * A failed read is logged with its cause and the seeded values stay in force.
 */

import { useEffect, useState } from "react";

import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";

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

/** The values the knob migration seeds — the render-before-answer placeholder. */
export const SEEDED_TABLE_LAYOUT_DEFAULTS: TableLayoutDefaults = {
  layout: "auto",
  fitMaxColumns: 8,
  rowHeight: "normal",
};

const cache = new Map<string, Promise<TableLayoutDefaults>>();

/**
 * 🚨 THREE KNOBS, ONE ROUND TRIP. These used to be three `platform.knob_resolve`
 * calls, one per value (check:knob-snapshot-adoption, 2026-09-22). Every read
 * here now goes through `ensureEffectiveKnob`, which answers from the one cached
 * `platform.knob_snapshot` for this organization — so the three below share a
 * single request, the request is shared with every other knob any screen in this
 * tab has already read, and adding a fourth layout knob costs nothing at run
 * time. `userId` is null on purpose: a shared table looks the way its OWNERS set
 * it up, so no personal rung may narrow it (the file header's precedence rule).
 */
async function load(organizationId: string): Promise<TableLayoutDefaults> {
  // The three addresses are written out as string literals rather than built
  // from a constant or a parameter: `every-knob-read-addresses-a-real-row.test.ts`
  // matches every read in the repo against the declared seed rows, and an
  // address it cannot read statically is one nothing checks.
  const [layout, fitMax, rowHeight] = await Promise.all([
    ensureEffectiveKnob(organizationId, null, {
      feature: "extensibility",
      key: "user_tables.default_layout",
    }),
    ensureEffectiveKnob(organizationId, null, {
      feature: "extensibility",
      key: "user_tables.fit_max_columns",
    }),
    ensureEffectiveKnob(organizationId, null, {
      feature: "extensibility",
      key: "user_tables.default_row_height",
    }),
  ]);
  const n = Number(fitMax);
  return {
    layout: parseLayoutMode(typeof layout === "string" ? layout : null),
    fitMaxColumns:
      Number.isFinite(n) && n >= 2 && n <= 30
        ? Math.round(n)
        : SEEDED_TABLE_LAYOUT_DEFAULTS.fitMaxColumns,
    rowHeight: parseRowDensity(typeof rowHeight === "string" ? rowHeight : null),
  };
}

export function useTableLayoutDefaults(
  organizationId: string | null | undefined,
): TableLayoutDefaults {
  const [defaults, setDefaults] = useState<TableLayoutDefaults>(
    SEEDED_TABLE_LAYOUT_DEFAULTS,
  );
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    let pending = cache.get(organizationId);
    if (!pending) {
      pending = load(organizationId);
      cache.set(organizationId, pending);
    }
    pending
      .then((value) => {
        if (!cancelled) setDefaults(value);
      })
      .catch((err) => {
        cache.delete(organizationId);
        console.error(
          "Table layout defaults could not be read; the platform's seeded defaults stay in force.",
          err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);
  return defaults;
}
