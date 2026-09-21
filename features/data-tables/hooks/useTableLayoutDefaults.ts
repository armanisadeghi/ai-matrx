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

import { supabase } from "@/utils/supabase/client";

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

const FEATURE = "extensibility";
const cache = new Map<string, Promise<TableLayoutDefaults>>();

async function resolveOne(organizationId: string, key: string): Promise<unknown> {
  const { data, error } = await supabase.schema("platform").rpc("knob_resolve", {
    p_feature: FEATURE,
    p_key: key,
    p_organization_id: organizationId,
  });
  if (error) throw new Error(`${FEATURE}.${key}: ${error.message}`);
  // knob_resolve answers either the bare value or an envelope carrying `value`.
  if (data && typeof data === "object" && !Array.isArray(data) && "value" in data) {
    return (data as { value: unknown }).value;
  }
  return data;
}

async function load(organizationId: string): Promise<TableLayoutDefaults> {
  const [layout, fitMax, rowHeight] = await Promise.all([
    resolveOne(organizationId, "user_tables.default_layout"),
    resolveOne(organizationId, "user_tables.fit_max_columns"),
    resolveOne(organizationId, "user_tables.default_row_height"),
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
