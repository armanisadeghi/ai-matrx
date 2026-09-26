"use client";

/**
 * WHICH TABLE GRID A RECORD-STORE TABLE DRAWS — the `data_tables.merged_grid` Feature Knob
 * (one-grid merge, steps 7-8).
 *
 * Off (the platform default until merge step 8): records-ui's classic grid. On: the merged grid —
 * the same grid carrying the older /data grid's controls. The platform default is set in the
 * admin dashboard; an organization or a person may override it (`platform.feature_knob` row
 * seeded by `migrations/campaign/merge7_the_merged_grid_is_a_feature_knob.sql`). Read for the
 * TABLE's organization and this person, through the one ladder-resolved snapshot.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";

export const MERGED_GRID_KNOB = { feature: "data_tables", key: "merged_grid" } as const;

/** `true` only when the knob answers `true`; "not answered yet" draws the classic grid. */
export function mergedGridOn(value: unknown): boolean {
  return value === true || value === "true";
}

export function useMergedGridKnob(organizationId: string | null): boolean {
  const userId = useAppSelector(selectUserId);
  return mergedGridOn(useEffectiveKnob(organizationId, userId ?? null, MERGED_GRID_KNOB));
}
