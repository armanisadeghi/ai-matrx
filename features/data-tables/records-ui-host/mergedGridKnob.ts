"use client";

/**
 * WHICH TABLE GRID A CUSTOM TABLE DRAWS — the `data_tables.merged_grid` Feature Knob
 * (one-grid merge, steps 7-8).
 *
 * On (the platform default since the switch-on, 2026-09-30): the merged grid — the one grid,
 * carrying the Sheet's controls (column menu, undo, add row, bulk edit, colour rules).
 * Off: records-ui's classic grid, kept only as an organization's or a person's explicit override.
 * The platform default is set in the admin dashboard (Limits & Knobs → Feature knobs); the row was
 * seeded by `migrations/campaign/merge7_the_merged_grid_is_a_feature_knob.sql`; its declared
 * default (`platform.feature_knob.default_value`) was turned On in the database 2026-10-03. Read for
 * the TABLE's organization and this person, through the one ladder-resolved snapshot.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";

export const MERGED_GRID_KNOB = { feature: "data_tables", key: "merged_grid" } as const;

/**
 * `false` only when the knob answers Off. "Not answered yet" draws the merged grid — the platform
 * default — so a table never flashes the classic grid for the moment before the snapshot lands.
 */
export function mergedGridOn(value: unknown): boolean {
  return value !== false && value !== "false";
}

export function useMergedGridKnob(organizationId: string | null): boolean {
  const userId = useAppSelector(selectUserId);
  return mergedGridOn(useEffectiveKnob(organizationId, userId ?? null, MERGED_GRID_KNOB));
}
